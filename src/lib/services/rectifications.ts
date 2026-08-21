import { eq, and, sql, desc, asc, count } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  invoiceRequests,
  invoiceRequestItems,
  documents,
  creditNotes,
  rectifications,
  warehouses,
  users,
  InvoiceRequest,
  Document,
  CreditNote,
  Rectification,
  RectificationStatus,
  RectificationReason,
} from "@/lib/db/schema";
import {
  calculateRequestTotals,
  calculateReconciliation,
  formatCLP,
} from "@/domain/pricing";
import { logAuditEvent } from "@/lib/auth/audit";
import { r2Client } from "@/lib/r2/client";
import {
  validatePdfBuffer,
  sanitizeDocument,
} from "@/lib/services/invoice-documents";
import { computeAgeIndicator } from "@/lib/services/invoice-queue";
import {
  SanitizedUser,
  SanitizedInvoiceRequest,
  SanitizedDocument,
  SanitizedCreditNote,
  SanitizedRectification,
  InvoiceTimelineEvent,
} from "@/domain/types";

export function generateCreditNoteStorageKey(
  requestNumber: string,
  creditNoteId: string,
  date: Date = new Date()
): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const cleanReqNumber = requestNumber.replace(/[^a-zA-Z0-9_-]/g, "");
  const cleanId = creditNoteId.replace(/[^a-zA-Z0-9_-]/g, "");
  return `notas-credito/${year}/${month}/${cleanReqNumber}/nc-${cleanId}.pdf`;
}

export function generateReplacementInvoiceStorageKey(
  requestNumber: string,
  customerRut: string,
  date: Date = new Date()
): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const cleanReqNumber = requestNumber.replace(/[^a-zA-Z0-9_-]/g, "");
  const cleanRut = customerRut.replace(/[^a-zA-Z0-9]/g, "");
  return `facturas/${year}/${month}/${cleanReqNumber}/${cleanReqNumber}_${cleanRut}_v2.pdf`;
}

export function sanitizeCreditNote(
  cn: CreditNote,
  createdByName?: string,
  doc?: Document,
  docAccessUrl?: string
): SanitizedCreditNote {
  return {
    id: cn.id,
    rectificationId: cn.rectificationId,
    invoiceRequestId: cn.invoiceRequestId,
    originalDocumentId: cn.originalDocumentId,
    siiFolio: cn.siiFolio,
    issuedAt: cn.issuedAt.toISOString(),
    grossTotal: cn.grossTotal,
    netTotal: cn.netTotal,
    vatTotal: cn.vatTotal,
    createdBy: cn.createdBy,
    createdByName,
    createdAt: cn.createdAt.toISOString(),
    document: doc ? sanitizeDocument(doc, docAccessUrl) : null,
  };
}

export function sanitizeRectification(
  r: Rectification,
  requesterName?: string,
  assignedName?: string,
  requestNumber?: string,
  creditNote?: SanitizedCreditNote | null,
  creditNoteDoc?: Document,
  creditNoteDocUrl?: string,
  originalInvoiceDoc?: Document,
  originalInvoiceDocUrl?: string,
  replacementInvoiceDoc?: Document,
  replacementInvoiceDocUrl?: string
): SanitizedRectification {
  return {
    id: r.id,
    invoiceRequestId: r.invoiceRequestId,
    requestNumber,
    originalInvoiceDocumentId: r.originalInvoiceDocumentId,
    requestedBy: r.requestedBy,
    requesterName,
    assignedTo: r.assignedTo,
    assignedName,
    reason: r.reason,
    comment: r.comment,
    status: r.status,
    creditNoteId: r.creditNoteId,
    creditNoteDocumentId: r.creditNoteDocumentId,
    replacementInvoiceDocumentId: r.replacementInvoiceDocumentId,
    correctedCustomerSnapshot: (r.correctedCustomerSnapshot as Record<string, unknown>) || null,
    correctedItemsSnapshot: (r.correctedItemsSnapshot as unknown[]) || null,
    siiGrossTotal: r.siiGrossTotal,
    grossDifference: r.grossDifference,
    reconciliationStatus: r.reconciliationStatus,
    requestedAt: r.requestedAt.toISOString(),
    assignedAt: r.assignedAt ? r.assignedAt.toISOString() : null,
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    age: computeAgeIndicator(r.requestedAt),
    creditNote: creditNote || null,
    creditNoteDocument: creditNoteDoc ? sanitizeDocument(creditNoteDoc, creditNoteDocUrl) : null,
    originalInvoiceDocument: originalInvoiceDoc ? sanitizeDocument(originalInvoiceDoc, originalInvoiceDocUrl) : null,
    replacementInvoiceDocument: replacementInvoiceDoc ? sanitizeDocument(replacementInvoiceDoc, replacementInvoiceDocUrl) : null,
  };
}

export async function requestRectificationService(
  currentUser: SanitizedUser,
  requestId: string,
  input: {
    reason: RectificationReason;
    comment?: string;
  },
  ipAddress?: string,
  dbOverride?: unknown
): Promise<SanitizedRectification> {
  const db = (dbOverride as ReturnType<typeof getDb>) || getDb();
  if (!db) {
    throw new Error("Base de datos no disponible.");
  }

  // 1. Fetch Target Invoice Request
  const [targetReq] = await db
    .select()
    .from(invoiceRequests)
    .where(eq(invoiceRequests.id, requestId))
    .limit(1);

  if (!targetReq) {
    throw new Error("NOT_FOUND: La solicitud de factura no existe.");
  }

  // 2. Precondition: Request MUST be COMPLETED
  if (targetReq.status !== "COMPLETED") {
    throw new Error(
      `INVALID_STATE: Solo se pueden solicitar cambios sobre facturas completadas (estado actual: ${targetReq.status}).`
    );
  }

  // 3. IDOR / Authorization Check
  if (currentUser.role === "WAREHOUSE_USER" && currentUser.warehouseId !== targetReq.warehouseId) {
    throw new Error("FORBIDDEN: No tienes permisos para solicitar cambios sobre facturas de otra bodega.");
  }

  // 4. Retrieve Active Invoice Document
  const attachedDocs = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.invoiceRequestId, targetReq.id),
        eq(documents.documentType, "INVOICE"),
        eq(documents.isVoided, false)
      )
    )
    .orderBy(desc(documents.createdAt))
    .limit(1);

  if (attachedDocs.length === 0) {
    throw new Error("MISSING_DOCUMENT: No existe una factura emitida activa asociada a esta solicitud.");
  }

  const originalInvoiceDoc = attachedDocs[0];

  // 5. Idempotency Check: Prevent multiple active rectifications on same invoice
  const activeRectifications = await db
    .select()
    .from(rectifications)
    .where(
      and(
        eq(rectifications.invoiceRequestId, targetReq.id),
        sql`${rectifications.status} IN ('REQUESTED', 'IN_PROGRESS', 'CREDIT_NOTE_REGISTERED', 'NEW_INVOICE_PENDING')`
      )
    )
    .limit(1);

  if (activeRectifications.length > 0) {
    // Return existing active rectification idempotently
    return sanitizeRectification(
      activeRectifications[0],
      currentUser.name,
      undefined,
      targetReq.requestNumber,
      null,
      undefined,
      undefined,
      originalInvoiceDoc
    );
  }

  // 6. Create Rectification record in DB
  const [newRectification] = await db
    .insert(rectifications)
    .values({
      invoiceRequestId: targetReq.id,
      originalInvoiceDocumentId: originalInvoiceDoc.id,
      requestedBy: currentUser.id,
      reason: input.reason,
      comment: input.comment ? input.comment.trim() : null,
      status: "REQUESTED",
    })
    .returning();

  // 7. Audit log
  await logAuditEvent({
    userId: currentUser.id,
    action: "RECTIFICATION_REQUESTED",
    entityType: "rectifications",
    entityId: newRectification.id,
    metadata: {
      invoiceRequestId: targetReq.id,
      requestNumber: targetReq.requestNumber,
      originalDocumentId: originalInvoiceDoc.id,
      reason: input.reason,
      comment: input.comment,
    },
    ipAddress,
  });

  return sanitizeRectification(
    newRectification,
    currentUser.name,
    undefined,
    targetReq.requestNumber,
    null,
    undefined,
    undefined,
    originalInvoiceDoc
  );
}

export async function getRectificationsQueueService(
  currentUser: SanitizedUser,
  params: {
    status?: RectificationStatus | "ALL";
    warehouseId?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  },
  dbOverride?: unknown
): Promise<{
  rectifications: SanitizedRectification[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const db = (dbOverride as ReturnType<typeof getDb>) || getDb();
  if (!db) {
    throw new Error("Base de datos no disponible.");
  }

  if (
    currentUser.role !== "INVOICE_EXECUTOR" &&
    currentUser.role !== "ADMIN" &&
    currentUser.role !== "MANAGEMENT"
  ) {
    throw new Error("FORBIDDEN: No tienes permisos para ver la cola de rectificaciones.");
  }

  const page = Math.max(1, params.page || 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize || 20));
  const offset = (page - 1) * pageSize;

  const conditions = [];

  if (params.status && params.status !== "ALL") {
    conditions.push(eq(rectifications.status, params.status));
  }

  if (params.warehouseId) {
    conditions.push(eq(invoiceRequests.warehouseId, params.warehouseId));
  }

  if (params.search && params.search.trim()) {
    const term = `%${params.search.trim().toLowerCase()}%`;
    conditions.push(
      sql`(
        LOWER(${invoiceRequests.requestNumber}) LIKE ${term} OR
        LOWER(${invoiceRequests.customerRutSnapshot}) LIKE ${term} OR
        LOWER(${invoiceRequests.customerLegalNameSnapshot}) LIKE ${term} OR
        LOWER(${rectifications.comment}) LIKE ${term}
      )`
    );
  }

  const [totalRes] = await db
    .select({ count: count() })
    .from(rectifications)
    .innerJoin(invoiceRequests, eq(rectifications.invoiceRequestId, invoiceRequests.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  const total = Number(totalRes?.count || 0);

  const rows = await db
    .select({
      rectification: rectifications,
      requestNumber: invoiceRequests.requestNumber,
      requesterName: users.name,
    })
    .from(rectifications)
    .innerJoin(invoiceRequests, eq(rectifications.invoiceRequestId, invoiceRequests.id))
    .leftJoin(users, eq(rectifications.requestedBy, users.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(rectifications.requestedAt), asc(rectifications.id))
    .limit(pageSize)
    .offset(offset);

  const sanitizedList = rows.map((r) =>
    sanitizeRectification(
      r.rectification,
      r.requesterName || undefined,
      undefined,
      r.requestNumber
    )
  );

  return {
    rectifications: sanitizedList,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getRectificationByIdService(
  currentUser: SanitizedUser,
  rectificationId: string,
  dbOverride?: unknown
): Promise<SanitizedRectification> {
  const db = (dbOverride as ReturnType<typeof getDb>) || getDb();
  if (!db) {
    throw new Error("Base de datos no disponible.");
  }

  const rows = await db
    .select({
      rectification: rectifications,
      request: invoiceRequests,
      warehouse: warehouses,
      requesterName: users.name,
    })
    .from(rectifications)
    .innerJoin(invoiceRequests, eq(rectifications.invoiceRequestId, invoiceRequests.id))
    .leftJoin(warehouses, eq(invoiceRequests.warehouseId, warehouses.id))
    .leftJoin(users, eq(rectifications.requestedBy, users.id))
    .where(eq(rectifications.id, rectificationId))
    .limit(1);

  if (rows.length === 0) {
    throw new Error("NOT_FOUND: La rectificación solicitada no existe.");
  }

  const { rectification: r, request: req, requesterName } = rows[0];

  // IDOR / Role Check
  if (currentUser.role === "WAREHOUSE_USER" && currentUser.warehouseId !== req.warehouseId) {
    throw new Error("FORBIDDEN: No tienes permisos para consultar esta rectificación.");
  }

  // Fetch related documents
  const allDocs = await db
    .select()
    .from(documents)
    .where(eq(documents.invoiceRequestId, req.id));

  const origDoc = allDocs.find((d) => d.id === r.originalInvoiceDocumentId);
  const cnDoc = allDocs.find((d) => d.id === r.creditNoteDocumentId);
  const repDoc = allDocs.find((d) => d.id === r.replacementInvoiceDocumentId);

  let creditNoteRecord: CreditNote | undefined;
  if (r.creditNoteId) {
    const [cn] = await db
      .select()
      .from(creditNotes)
      .where(eq(creditNotes.id, r.creditNoteId))
      .limit(1);
    creditNoteRecord = cn;
  }

  let origDocUrl: string | undefined;
  let cnDocUrl: string | undefined;
  let repDocUrl: string | undefined;

  if (origDoc?.storageKey) {
    origDocUrl = await r2Client.generatePresignedDownloadUrl(origDoc.storageKey, 900);
  }
  if (cnDoc?.storageKey) {
    cnDocUrl = await r2Client.generatePresignedDownloadUrl(cnDoc.storageKey, 900);
  }
  if (repDoc?.storageKey) {
    repDocUrl = await r2Client.generatePresignedDownloadUrl(repDoc.storageKey, 900);
  }

  const sanitized = sanitizeRectification(
    r,
    requesterName || undefined,
    undefined,
    req.requestNumber,
    creditNoteRecord ? sanitizeCreditNote(creditNoteRecord, undefined, cnDoc, cnDocUrl) : null,
    cnDoc,
    cnDocUrl,
    origDoc,
    origDocUrl,
    repDoc,
    repDocUrl
  );

  return sanitized;
}

export async function claimRectificationService(
  currentUser: SanitizedUser,
  rectificationId: string,
  ipAddress?: string,
  dbOverride?: unknown
): Promise<SanitizedRectification> {
  const db = (dbOverride as ReturnType<typeof getDb>) || getDb();
  if (!db) {
    throw new Error("Base de datos no disponible.");
  }

  if (currentUser.role !== "INVOICE_EXECUTOR" && currentUser.role !== "ADMIN") {
    throw new Error("FORBIDDEN: No tienes permisos para tomar rectificaciones.");
  }

  // Atomic Claim Query: exactly 1 concurrent winner
  const updatedList: Rectification[] = await db
    .update(rectifications)
    .set({
      status: "IN_PROGRESS",
      assignedTo: currentUser.id,
      assignedAt: sql`NOW()`,
      updatedAt: sql`NOW()`,
    })
    .where(
      and(
        eq(rectifications.id, rectificationId),
        eq(rectifications.status, "REQUESTED"),
        sql`${rectifications.assignedTo} IS NULL`
      )
    )
    .returning();

  if (updatedList.length === 0) {
    const existing = await db
      .select({
        rectification: rectifications,
        assignedName: users.name,
      })
      .from(rectifications)
      .leftJoin(users, eq(rectifications.assignedTo, users.id))
      .where(eq(rectifications.id, rectificationId))
      .limit(1);

    if (existing.length === 0) {
      throw new Error("NOT_FOUND: La rectificación no existe.");
    }

    const { rectification: r, assignedName } = existing[0];
    if (r.assignedTo === currentUser.id) {
      return sanitizeRectification(r, undefined, currentUser.name);
    }

    throw new Error(
      `CLAIM_CONFLICT: La rectificación ya fue tomada por ${assignedName || "otro ejecutor"}.`
    );
  }

  const claimed = updatedList[0];

  await logAuditEvent({
    userId: currentUser.id,
    action: "RECTIFICATION_ASSIGNED",
    entityType: "rectifications",
    entityId: claimed.id,
    metadata: {
      invoiceRequestId: claimed.invoiceRequestId,
      assignedTo: currentUser.id,
      assignedName: currentUser.name,
    },
    ipAddress,
  });

  return sanitizeRectification(claimed, undefined, currentUser.name);
}

export async function registerCreditNoteService(
  currentUser: SanitizedUser,
  rectificationId: string,
  file: {
    buffer: Buffer | Uint8Array;
    fileName: string;
    mimeType: string;
    fileSize: number;
  },
  folio?: string,
  ipAddress?: string,
  dbOverride?: unknown
): Promise<SanitizedCreditNote> {
  const db = (dbOverride as ReturnType<typeof getDb>) || getDb();
  if (!db) {
    throw new Error("Base de datos no disponible.");
  }

  if (currentUser.role !== "INVOICE_EXECUTOR" && currentUser.role !== "ADMIN") {
    throw new Error("FORBIDDEN: No tienes permisos para registrar Notas de Crédito.");
  }

  const [rect] = await db
    .select()
    .from(rectifications)
    .where(eq(rectifications.id, rectificationId))
    .limit(1);

  if (!rect) {
    throw new Error("NOT_FOUND: La rectificación no existe.");
  }

  if (currentUser.role === "INVOICE_EXECUTOR" && rect.assignedTo !== currentUser.id) {
    throw new Error("FORBIDDEN: No puedes registrar la Nota de Crédito en una rectificación asignada a otro ejecutor.");
  }

  if (rect.status !== "IN_PROGRESS" && rect.status !== "REQUESTED") {
    throw new Error(`INVALID_STATE: Estado no válido para registrar Nota de Crédito (estado actual: ${rect.status}).`);
  }

  // PDF Validation
  const validation = validatePdfBuffer(file.buffer, file.fileSize, file.mimeType);
  if (!validation.valid) {
    throw new Error(`VALIDATION_ERROR: ${validation.reason}`);
  }

  const [targetReq] = await db
    .select()
    .from(invoiceRequests)
    .where(eq(invoiceRequests.id, rect.invoiceRequestId))
    .limit(1);

  if (!targetReq) {
    throw new Error("NOT_FOUND: La solicitud original no existe.");
  }

  // Storage key for Credit Note
  const creditNoteUuid = crypto.randomUUID();
  const storageKey = generateCreditNoteStorageKey(
    targetReq.requestNumber,
    creditNoteUuid
  );

  // 1. Upload to Cloudflare R2
  try {
    await r2Client.putObject({
      key: storageKey,
      body: file.buffer,
      contentType: "application/pdf",
    });
  } catch (error) {
    throw new Error(`STORAGE_ERROR: Fallo al almacenar la Nota de Crédito en R2: ${error instanceof Error ? error.message : "Error desconocido"}`);
  }

  // 2. Persist in PostgreSQL
  try {
    // Insert document record
    const [doc] = await db
      .insert(documents)
      .values({
        documentType: "CREDIT_NOTE",
        storageProvider: "R2",
        storageKey,
        fileName: file.fileName,
        mimeType: "application/pdf",
        fileSize: file.fileSize,
        invoiceRequestId: targetReq.id,
        uploadedBy: currentUser.id,
      })
      .returning();

    // Insert credit note record
    const [cn] = await db
      .insert(creditNotes)
      .values({
        id: creditNoteUuid,
        rectificationId: rect.id,
        invoiceRequestId: targetReq.id,
        originalDocumentId: rect.originalInvoiceDocumentId,
        siiFolio: folio ? folio.trim() : null,
        grossTotal: targetReq.expectedGrossTotal,
        netTotal: null,
        vatTotal: null,
        createdBy: currentUser.id,
      })
      .returning();

    // Link document with credit_note_id
    await db
      .update(documents)
      .set({ creditNoteId: cn.id })
      .where(eq(documents.id, doc.id));

    // Void original invoice document
    await db
      .update(documents)
      .set({
        isVoided: true,
        voidedAt: sql`NOW()`,
        voidedByDocumentId: doc.id,
      })
      .where(eq(documents.id, rect.originalInvoiceDocumentId));

    // Update rectification status
    await db
      .update(rectifications)
      .set({
        creditNoteId: cn.id,
        creditNoteDocumentId: doc.id,
        status: "CREDIT_NOTE_REGISTERED",
        updatedAt: sql`NOW()`,
      })
      .where(eq(rectifications.id, rect.id));

    // Audit log
    await logAuditEvent({
      userId: currentUser.id,
      action: "CREDIT_NOTE_REGISTERED",
      entityType: "credit_notes",
      entityId: cn.id,
      metadata: {
        rectificationId: rect.id,
        invoiceRequestId: targetReq.id,
        originalDocumentId: rect.originalInvoiceDocumentId,
        documentId: doc.id,
        storageKey,
        siiFolio: folio,
        grossTotal: targetReq.expectedGrossTotal,
      },
      ipAddress,
    });

    const accessUrl = await r2Client.generatePresignedDownloadUrl(storageKey, 900);
    return sanitizeCreditNote(cn, currentUser.name, doc, accessUrl);
  } catch (dbError) {
    // Compensatory delete in R2
    try {
      await r2Client.deleteObject(storageKey);
    } catch {
      // ignore
    }
    throw new Error(`DATABASE_ERROR: Error al guardar la Nota de Crédito: ${dbError instanceof Error ? dbError.message : "Error desconocido"}`);
  }
}

export async function uploadReplacementInvoiceService(
  currentUser: SanitizedUser,
  rectificationId: string,
  file: {
    buffer: Buffer | Uint8Array;
    fileName: string;
    mimeType: string;
    fileSize: number;
  },
  siiGrossTotal?: number,
  ipAddress?: string,
  dbOverride?: unknown
): Promise<SanitizedRectification> {
  const db = (dbOverride as ReturnType<typeof getDb>) || getDb();
  if (!db) {
    throw new Error("Base de datos no disponible.");
  }

  if (currentUser.role !== "INVOICE_EXECUTOR" && currentUser.role !== "ADMIN") {
    throw new Error("FORBIDDEN: No tienes permisos para cargar nuevas facturas.");
  }

  const [rect] = await db
    .select()
    .from(rectifications)
    .where(eq(rectifications.id, rectificationId))
    .limit(1);

  if (!rect) {
    throw new Error("NOT_FOUND: La rectificación no existe.");
  }

  if (currentUser.role === "INVOICE_EXECUTOR" && rect.assignedTo !== currentUser.id) {
    throw new Error("FORBIDDEN: No puedes cargar la nueva factura en una rectificación asignada a otro ejecutor.");
  }

  // Precondition: Credit note MUST be registered first
  if (!rect.creditNoteId || !rect.creditNoteDocumentId) {
    throw new Error("CREDIT_NOTE_REQUIRED: Debes registrar primero la Nota de Crédito antes de cargar la nueva factura.");
  }

  if (rect.status === "COMPLETED") {
    throw new Error("INMUTABLE: La rectificación ya fue completada y es inmutable.");
  }

  // PDF Validation
  const validation = validatePdfBuffer(file.buffer, file.fileSize, file.mimeType);
  if (!validation.valid) {
    throw new Error(`VALIDATION_ERROR: ${validation.reason}`);
  }

  const [targetReq] = await db
    .select()
    .from(invoiceRequests)
    .where(eq(invoiceRequests.id, rect.invoiceRequestId))
    .limit(1);

  if (!targetReq) {
    throw new Error("NOT_FOUND: La solicitud original no existe.");
  }

  // Deterministic storage key for replacement invoice
  const storageKey = generateReplacementInvoiceStorageKey(
    targetReq.requestNumber,
    targetReq.customerRutSnapshot
  );

  // 1. Upload to Cloudflare R2
  try {
    await r2Client.putObject({
      key: storageKey,
      body: file.buffer,
      contentType: "application/pdf",
    });
  } catch (error) {
    throw new Error(`STORAGE_ERROR: Fallo al almacenar la nueva factura en R2: ${error instanceof Error ? error.message : "Error desconocido"}`);
  }

  // 2. Perform reconciliation if siiGrossTotal is provided
  let reconStatus = rect.reconciliationStatus;
  let grossDiff = rect.grossDifference;
  let enteredGross = rect.siiGrossTotal;

  if (siiGrossTotal !== undefined && siiGrossTotal !== null) {
    const recon = calculateReconciliation(targetReq.expectedGrossTotal, siiGrossTotal);
    reconStatus = recon.status;
    grossDiff = recon.grossDifference;
    enteredGross = recon.siiGrossTotal;
  }

  // 3. Persist in PostgreSQL
  try {
    const [doc] = await db
      .insert(documents)
      .values({
        documentType: "INVOICE",
        storageProvider: "R2",
        storageKey,
        fileName: file.fileName,
        mimeType: "application/pdf",
        fileSize: file.fileSize,
        invoiceRequestId: targetReq.id,
        uploadedBy: currentUser.id,
      })
      .returning();

    const [updatedRect] = await db
      .update(rectifications)
      .set({
        replacementInvoiceDocumentId: doc.id,
        status: "NEW_INVOICE_PENDING",
        siiGrossTotal: enteredGross,
        grossDifference: grossDiff,
        reconciliationStatus: reconStatus,
        updatedAt: sql`NOW()`,
      })
      .where(eq(rectifications.id, rect.id))
      .returning();

    await logAuditEvent({
      userId: currentUser.id,
      action: "REPLACEMENT_INVOICE_UPLOADED",
      entityType: "rectifications",
      entityId: rect.id,
      metadata: {
        invoiceRequestId: targetReq.id,
        documentId: doc.id,
        storageKey,
        siiGrossTotal: enteredGross,
        reconciliationStatus: reconStatus,
      },
      ipAddress,
    });

    const accessUrl = await r2Client.generatePresignedDownloadUrl(storageKey, 900);
    return sanitizeRectification(
      updatedRect,
      undefined,
      currentUser.name,
      targetReq.requestNumber,
      null,
      undefined,
      undefined,
      undefined,
      undefined,
      doc,
      accessUrl
    );
  } catch (dbError) {
    try {
      await r2Client.deleteObject(storageKey);
    } catch {
      // ignore
    }
    throw new Error(`DATABASE_ERROR: Error al guardar la nueva factura: ${dbError instanceof Error ? dbError.message : "Error desconocido"}`);
  }
}

export async function completeRectificationService(
  currentUser: SanitizedUser,
  rectificationId: string,
  ipAddress?: string,
  dbOverride?: unknown
): Promise<SanitizedRectification> {
  const db = (dbOverride as ReturnType<typeof getDb>) || getDb();
  if (!db) {
    throw new Error("Base de datos no disponible.");
  }

  if (currentUser.role !== "INVOICE_EXECUTOR" && currentUser.role !== "ADMIN") {
    throw new Error("FORBIDDEN: No tienes permisos para finalizar rectificaciones.");
  }

  const [rect] = await db
    .select()
    .from(rectifications)
    .where(eq(rectifications.id, rectificationId))
    .limit(1);

  if (!rect) {
    throw new Error("NOT_FOUND: La rectificación no existe.");
  }

  // Idempotency: Return completed state smoothly
  if (rect.status === "COMPLETED") {
    return sanitizeRectification(rect, undefined, currentUser.name);
  }

  if (currentUser.role === "INVOICE_EXECUTOR" && rect.assignedTo !== currentUser.id) {
    throw new Error("FORBIDDEN: No puedes finalizar una rectificación asignada a otro ejecutor.");
  }

  // Strict Preconditions Check
  if (!rect.creditNoteId || !rect.creditNoteDocumentId) {
    throw new Error("MISSING_CREDIT_NOTE: No se puede finalizar la corrección sin una Nota de Crédito registrada.");
  }

  if (!rect.replacementInvoiceDocumentId) {
    throw new Error("MISSING_REPLACEMENT_INVOICE: No se puede finalizar la corrección sin haber cargado la nueva factura emitida.");
  }

  // Atomic completion transition in PostgreSQL
  const [completed] = await db
    .update(rectifications)
    .set({
      status: "COMPLETED",
      completedAt: sql`NOW()`,
      updatedAt: sql`NOW()`,
    })
    .where(
      and(
        eq(rectifications.id, rectificationId),
        sql`${rectifications.status} != 'COMPLETED'`
      )
    )
    .returning();

  if (!completed) {
    throw new Error("CONCURRENCY_ERROR: La rectificación fue modificada concurrentemente.");
  }

  // Ensure original request updated timestamp is refreshed
  await db
    .update(invoiceRequests)
    .set({
      updatedAt: sql`NOW()`,
    })
    .where(eq(invoiceRequests.id, completed.invoiceRequestId));

  // Audit log
  await logAuditEvent({
    userId: currentUser.id,
    action: "RECTIFICATION_COMPLETED",
    entityType: "rectifications",
    entityId: completed.id,
    metadata: {
      invoiceRequestId: completed.invoiceRequestId,
      creditNoteId: completed.creditNoteId,
      replacementInvoiceDocumentId: completed.replacementInvoiceDocumentId,
      reconciliationStatus: completed.reconciliationStatus,
    },
    ipAddress,
  });

  return sanitizeRectification(completed, undefined, currentUser.name);
}

export async function getInvoiceTimelineService(
  currentUser: SanitizedUser,
  requestId: string,
  dbOverride?: unknown
): Promise<InvoiceTimelineEvent[]> {
  const db = (dbOverride as ReturnType<typeof getDb>) || getDb();
  if (!db) {
    throw new Error("Base de datos no disponible.");
  }

  const [req] = await db
    .select()
    .from(invoiceRequests)
    .where(eq(invoiceRequests.id, requestId))
    .limit(1);

  if (!req) {
    throw new Error("NOT_FOUND: La solicitud no existe.");
  }

  if (currentUser.role === "WAREHOUSE_USER" && currentUser.warehouseId !== req.warehouseId) {
    throw new Error("FORBIDDEN: No tienes permisos para ver el historial de esta solicitud.");
  }

  const events: InvoiceTimelineEvent[] = [];

  // 1. Request Created
  events.push({
    id: `req-created-${req.id}`,
    type: "REQUEST_CREATED",
    title: "Solicitud de factura creada",
    description: `Solicitud ${req.requestNumber} ingresada por ${req.customerLegalNameSnapshot}.`,
    timestamp: req.createdAt.toISOString(),
  });

  // 2. Invoice Completed
  if (req.completedAt) {
    events.push({
      id: `inv-completed-${req.id}`,
      type: "INVOICE_COMPLETED",
      title: "Factura emitida",
      description: `Factura inicial finalizada exitosamente por un total de ${formatCLP(req.expectedGrossTotal)}.`,
      timestamp: req.completedAt.toISOString(),
    });
  }

  // 3. Rectifications & Credit Notes
  const rects = await db
    .select()
    .from(rectifications)
    .where(eq(rectifications.invoiceRequestId, req.id))
    .orderBy(asc(rectifications.requestedAt));

  for (const r of rects) {
    events.push({
      id: `rect-requested-${r.id}`,
      type: "RECTIFICATION_REQUESTED",
      title: "Cambio solicitado",
      description: `Motivo: ${r.reason}${r.comment ? ` — "${r.comment}"` : ""}`,
      timestamp: r.requestedAt.toISOString(),
    });

    if (r.creditNoteId) {
      events.push({
        id: `cn-registered-${r.id}`,
        type: "CREDIT_NOTE_REGISTERED",
        title: "Factura anterior anulada",
        description: "Se registró la Nota de Crédito para anular la factura anterior.",
        timestamp: r.updatedAt.toISOString(),
      });
    }

    if (r.status === "COMPLETED" && r.completedAt) {
      events.push({
        id: `rect-completed-${r.id}`,
        type: "RECTIFICATION_COMPLETED",
        title: "Nueva factura realizada",
        description: "Se finalizó la emisión de la nueva factura corregida.",
        timestamp: r.completedAt.toISOString(),
      });
    }
  }

  return events;
}
