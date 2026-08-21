import { eq, and, sql, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  invoiceRequests,
  invoiceRequestItems,
  documents,
  users,
  warehouses,
  InvoiceRequest,
  Document,
} from "@/lib/db/schema";
import { r2Client } from "@/lib/r2/client";
import { logAuditEvent } from "@/lib/auth/audit";
import {
  SanitizedDocument,
  SanitizedInvoiceRequest,
  SanitizedUser,
} from "@/domain/types";
import { sanitizeQueueInvoiceRequest } from "./invoice-queue";

export const MAX_PDF_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB

/**
 * Valida un archivo PDF en el servidor comprobando tamaño y Magic Bytes (%PDF-).
 */
export function validatePdfBuffer(
  buffer: Uint8Array | Buffer,
  fileSize: number,
  mimeType: string
): { valid: boolean; reason?: string } {
  if (!buffer || buffer.length === 0 || fileSize <= 0) {
    return { valid: false, reason: "El archivo está vac?o." };
  }

  if (fileSize > MAX_PDF_SIZE_BYTES || buffer.length > MAX_PDF_SIZE_BYTES) {
    return {
      valid: false,
      reason: `El archivo supera el tamaño máximo permitido de 2 MB (${(fileSize / (1024 * 1024)).toFixed(2)} MB).`,
    };
  }

  // Magic bytes check for PDF: %PDF (0x25, 0x50, 0x44, 0x46)
  if (
    buffer.length < 4 ||
    buffer[0] !== 0x25 ||
    buffer[1] !== 0x50 ||
    buffer[2] !== 0x44 ||
    buffer[3] !== 0x46
  ) {
    return {
      valid: false,
      reason: "El archivo no tiene una firma válida de documento PDF (%PDF).",
    };
  }

  return { valid: true };
}

/**
 * Genera una storage key determin?stica y segura server-side.
 * Estructura: facturas/YYYY/MM/FAC-YYYY-NNNNNN/FAC-YYYY-NNNNNN_RUT.pdf
 */
export function generateInvoiceStorageKey(
  requestNumber: string,
  customerRut: string,
  date: Date = new Date()
): string {
  const year = date.getFullYear().toString();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const cleanRut = customerRut.replace(/[^0-9kK]/g, "").toUpperCase();
  const cleanRequestNumber = requestNumber.replace(/[^a-zA-Z0-9-]/g, "");

  return `facturas/${year}/${month}/${cleanRequestNumber}/${cleanRequestNumber}_${cleanRut}.pdf`;
}

export function sanitizeDocument(d: Document, accessUrl?: string): SanitizedDocument {
  return {
    id: d.id,
    documentType: d.documentType,
    storageProvider: d.storageProvider,
    storageKey: d.storageKey,
    externalUrl: d.externalUrl,
    fileName: d.fileName,
    mimeType: d.mimeType,
    fileSize: d.fileSize,
    invoiceRequestId: d.invoiceRequestId,
    creditNoteId: d.creditNoteId,
    uploadedBy: d.uploadedBy,
    createdAt: d.createdAt.toISOString(),
    accessUrl,
  };
}

export async function uploadInvoiceDocumentService(
  currentUser: SanitizedUser,
  requestId: string,
  file: {
    buffer: Buffer | Uint8Array;
    fileName: string;
    mimeType: string;
    fileSize: number;
  },
  ipAddress?: string,
  dbOverride?: unknown
): Promise<SanitizedDocument> {
  const db = (dbOverride as ReturnType<typeof getDb>) || getDb();
  if (!db) {
    throw new Error("Base de datos no disponible.");
  }

  if (currentUser.role !== "INVOICE_EXECUTOR" && currentUser.role !== "ADMIN") {
    throw new Error("FORBIDDEN: No tienes permisos para cargar documentos de factura.");
  }

  const existingReqList: InvoiceRequest[] = await db
    .select()
    .from(invoiceRequests)
    .where(eq(invoiceRequests.id, requestId))
    .limit(1);

  if (existingReqList.length === 0) {
    throw new Error("NOT_FOUND: La solicitud no existe.");
  }

  const targetReq = existingReqList[0];

  if (targetReq.status === "COMPLETED") {
    throw new Error("INMUTABLE: No se puede reemplazar el documento de una factura ya finalizada.");
  }

  if (targetReq.status !== "IN_PROGRESS") {
    throw new Error("INVALID_STATE: Solo se pueden cargar documentos a solicitudes en proceso.");
  }

  // IDOR / Ownership Check: Executor must be assigned
  if (currentUser.role === "INVOICE_EXECUTOR" && targetReq.assignedTo !== currentUser.id) {
    throw new Error("FORBIDDEN: No puedes cargar documentos a una solicitud asignada a otro ejecutor.");
  }

  // Server-side PDF validation
  const validation = validatePdfBuffer(file.buffer, file.fileSize, file.mimeType);
  if (!validation.valid) {
    throw new Error(`VALIDATION_ERROR: ${validation.reason}`);
  }

  // Generate storage key server-side
  const storageKey = generateInvoiceStorageKey(
    targetReq.requestNumber,
    targetReq.customerRutSnapshot,
    new Date()
  );

  // Check for previous document on this request (for replacement)
  const existingDocs = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.invoiceRequestId, targetReq.id),
        eq(documents.documentType, "INVOICE")
      )
    )
    .limit(1);

  const previousDoc = existingDocs.length > 0 ? existingDocs[0] : null;

  // 1. Upload to R2
  try {
    await r2Client.putObject({
      key: storageKey,
      body: file.buffer,
      contentType: "application/pdf",
    });
  } catch (error) {
    console.error("Error uploading object to R2:", error);
    throw new Error("STORAGE_ERROR: No se pudo subir el archivo al almacenamiento R2.");
  }

  // 2. Persist record in PostgreSQL (with compensation if DB fails)
  let insertedDoc: Document;
  try {
    if (previousDoc) {
      // Replace existing unfinalized document
      const [updated] = await db
        .update(documents)
        .set({
          storageKey,
          fileName: file.fileName.slice(0, 500),
          mimeType: "application/pdf",
          fileSize: file.fileSize,
          uploadedBy: currentUser.id,
          createdAt: sql`NOW()`,
        })
        .where(eq(documents.id, previousDoc.id))
        .returning();
      insertedDoc = updated;

      // Clean up previous R2 storage key if different
      if (previousDoc.storageKey !== storageKey) {
        await r2Client.deleteObject(previousDoc.storageKey);
      }
    } else {
      const [created] = await db
        .insert(documents)
        .values({
          documentType: "INVOICE",
          storageProvider: "R2",
          storageKey,
          fileName: file.fileName.slice(0, 500),
          mimeType: "application/pdf",
          fileSize: file.fileSize,
          invoiceRequestId: targetReq.id,
          uploadedBy: currentUser.id,
        })
        .returning();
      insertedDoc = created;
    }
  } catch (dbError) {
    // Compensatory delete from R2 on DB insert failure
    console.error("DB error persisting document, executing compensatory R2 deletion:", dbError);
    await r2Client.deleteObject(storageKey);
    throw new Error("DATABASE_ERROR: Error al registrar el documento en la base de datos.");
  }

  // 3. Log Audit
  await logAuditEvent({
    userId: currentUser.id,
    action: previousDoc ? "INVOICE_REPLACED" : "INVOICE_UPLOADED",
    entityType: "documents",
    entityId: insertedDoc.id,
    metadata: {
      invoiceRequestId: targetReq.id,
      requestNumber: targetReq.requestNumber,
      storageKey: insertedDoc.storageKey,
      fileSize: insertedDoc.fileSize,
    },
    ipAddress,
  });

  const accessUrl = r2Client.isConfigured()
    ? await r2Client.generatePresignedDownloadUrl({
        key: insertedDoc.storageKey,
        expiresInSeconds: 900,
      })
    : `/api/v1/documents/${insertedDoc.id}/access?stream=true`;

  return sanitizeDocument(insertedDoc, accessUrl);
}

export async function completeInvoiceRequestService(
  currentUser: SanitizedUser,
  requestId: string,
  ipAddress?: string,
  dbOverride?: unknown
): Promise<SanitizedInvoiceRequest> {
  const db = (dbOverride as ReturnType<typeof getDb>) || getDb();
  if (!db) {
    throw new Error("Base de datos no disponible.");
  }

  if (currentUser.role !== "INVOICE_EXECUTOR" && currentUser.role !== "ADMIN") {
    throw new Error("FORBIDDEN: No tienes permisos para finalizar facturas.");
  }

  const existingReqList: InvoiceRequest[] = await db
    .select()
    .from(invoiceRequests)
    .where(eq(invoiceRequests.id, requestId))
    .limit(1);

  if (existingReqList.length === 0) {
    throw new Error("NOT_FOUND: La solicitud no existe.");
  }

  const targetReq = existingReqList[0];

  // Idempotency: If already COMPLETED, return current state smoothly
  if (targetReq.status === "COMPLETED") {
    const itemsList = await db
      .select()
      .from(invoiceRequestItems)
      .where(eq(invoiceRequestItems.invoiceRequestId, targetReq.id))
      .orderBy(invoiceRequestItems.lineNumber);

    const docList = await db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.invoiceRequestId, targetReq.id),
          eq(documents.documentType, "INVOICE")
        )
      )
      .limit(1);

    const sanitized = sanitizeQueueInvoiceRequest(targetReq, itemsList);
    if (docList.length > 0) {
      sanitized.document = sanitizeDocument(docList[0]);
    }
    return sanitized;
  }

  if (targetReq.status !== "IN_PROGRESS") {
    throw new Error(`INVALID_STATE: Solo una solicitud en proceso puede ser finalizada (estado actual: ${targetReq.status}).`);
  }

  // IDOR / Ownership Check
  if (currentUser.role === "INVOICE_EXECUTOR" && targetReq.assignedTo !== currentUser.id) {
    throw new Error("FORBIDDEN: No puedes finalizar una solicitud asignada a otro ejecutor.");
  }

  // Document Check: MUST have valid INVOICE PDF registered (MANDATORY)
  const attachedDocs = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.invoiceRequestId, targetReq.id),
        eq(documents.documentType, "INVOICE")
      )
    )
    .limit(1);

  if (attachedDocs.length === 0) {
    throw new Error("MISSING_DOCUMENT: Debes cargar el PDF de la factura antes de finalizar.");
  }

  const invoiceDoc = attachedDocs[0];

  // Atomic completion transition in PostgreSQL
  const [completedReq] = await db
    .update(invoiceRequests)
    .set({
      status: "COMPLETED",
      completedAt: sql`NOW()`,
      updatedAt: sql`NOW()`,
    })
    .where(
      and(
        eq(invoiceRequests.id, requestId),
        eq(invoiceRequests.status, "IN_PROGRESS")
      )
    )
    .returning();

  if (!completedReq) {
    throw new Error("CONCURRENCY_ERROR: La solicitud fue modificada concurrentemente.");
  }

  await logAuditEvent({
    userId: currentUser.id,
    action: "INVOICE_COMPLETED",
    entityType: "invoice_requests",
    entityId: completedReq.id,
    metadata: {
      requestNumber: completedReq.requestNumber,
      expectedGrossTotal: completedReq.expectedGrossTotal,
      siiGrossTotal: completedReq.siiGrossTotal,
      reconciliationStatus: completedReq.reconciliationStatus,
      documentId: invoiceDoc.id,
      storageKey: invoiceDoc.storageKey,
    },
    ipAddress,
  });

  const itemsList = await db
    .select()
    .from(invoiceRequestItems)
    .where(eq(invoiceRequestItems.invoiceRequestId, completedReq.id))
    .orderBy(invoiceRequestItems.lineNumber);

  const sanitized = sanitizeQueueInvoiceRequest(completedReq, itemsList);
  sanitized.document = sanitizeDocument(invoiceDoc);

  return sanitized;
}

export async function getInvoiceDocumentAccessService(
  currentUser: SanitizedUser,
  params: { requestId?: string; documentId?: string },
  ipAddress?: string,
  dbOverride?: unknown
): Promise<{
  document: SanitizedDocument;
  accessUrl: string;
}> {
  const db = (dbOverride as ReturnType<typeof getDb>) || getDb();
  if (!db) {
    throw new Error("Base de datos no disponible.");
  }

  let docQuery;
  if (params.documentId) {
    docQuery = db.select().from(documents).where(eq(documents.id, params.documentId)).limit(1);
  } else if (params.requestId) {
    docQuery = db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.invoiceRequestId, params.requestId),
          eq(documents.documentType, "INVOICE")
        )
      )
      .limit(1);
  } else {
    throw new Error("PARAM_REQUIRED: Debes especificar documentId o requestId.");
  }

  const docList = await docQuery;
  if (docList.length === 0) {
    throw new Error("NOT_FOUND: El documento solicitado no existe.");
  }

  const doc = docList[0];

  // Authorization and IDOR check
  if (doc.invoiceRequestId) {
    const [req] = await db
      .select()
      .from(invoiceRequests)
      .where(eq(invoiceRequests.id, doc.invoiceRequestId))
      .limit(1);

    if (req) {
      if (currentUser.role === "WAREHOUSE_USER" && req.requestedBy !== currentUser.id) {
        throw new Error("FORBIDDEN: No tienes permisos para acceder a este documento.");
      }
    }
  }

  const accessUrl = r2Client.isConfigured()
    ? await r2Client.generatePresignedDownloadUrl({
        key: doc.storageKey,
        expiresInSeconds: 900, // 15 min
      })
    : `/api/v1/documents/${doc.id}/access?stream=true`;

  await logAuditEvent({
    userId: currentUser.id,
    action: "DOCUMENT_ACCESSED",
    entityType: "documents",
    entityId: doc.id,
    metadata: {
      storageKey: doc.storageKey,
      documentType: doc.documentType,
    },
    ipAddress,
  });

  return {
    document: sanitizeDocument(doc, accessUrl),
    accessUrl,
  };
}
