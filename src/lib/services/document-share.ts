import crypto from "crypto";
import { eq, and, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  documents,
  invoiceRequests,
  documentShareTokens,
  rectifications,
  Document,
  DocumentShareToken,
  InvoiceRequest,
} from "@/lib/db/schema";
import { r2Client } from "@/lib/r2/client";
import { logAuditEvent } from "@/lib/auth/audit";
import { SanitizedUser, SanitizedDocumentShareToken } from "@/domain/types";

export interface CreateShareTokenResult {
  shareToken: SanitizedDocumentShareToken;
  rawToken: string;
}

export type ResolvedShareStatus =
  | {
      status: "ACTIVE";
      document: Document;
      invoiceRequest: InvoiceRequest;
      pdfData: Uint8Array;
      contentType: string;
      fileName: string;
    }
  | {
      status: "SUPERSEDED";
      document: Document;
      invoiceRequest: InvoiceRequest;
      replacementDocumentId?: string | null;
    };

export async function createDocumentShareTokenService(
  currentUser: SanitizedUser,
  documentId: string,
  origin?: string,
  ipAddress?: string,
  dbOverride?: unknown
): Promise<CreateShareTokenResult> {
  const db = (dbOverride as ReturnType<typeof getDb>) || getDb();
  if (!db) {
    throw new Error("Base de datos no disponible.");
  }

  // 1. Fetch Document
  const docList = await db
    .select()
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);

  if (docList.length === 0) {
    throw new Error("NOT_FOUND: El documento no existe.");
  }

  const doc = docList[0];

  if (doc.documentType !== "INVOICE") {
    throw new Error("INVALID_DOCUMENT_TYPE: Solo se pueden compartir facturas públicas controladas.");
  }

  if (!doc.invoiceRequestId) {
    throw new Error("INVALID_DOCUMENT: El documento no está asociado a una solicitud de factura.");
  }

  // 2. Fetch Invoice Request & IDOR Check
  const reqList = await db
    .select()
    .from(invoiceRequests)
    .where(eq(invoiceRequests.id, doc.invoiceRequestId))
    .limit(1);

  if (reqList.length === 0) {
    throw new Error("NOT_FOUND: Solicitud de factura no encontrada.");
  }

  const req = reqList[0];

  if (currentUser.role === "WAREHOUSE_USER" && req.requestedBy !== currentUser.id) {
    throw new Error("FORBIDDEN: No tienes permisos para generar enlaces de esta factura.");
  }

  // 3. Generate Cryptographically Secure Random Token (32 bytes hex = 64 chars)
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  // 4. Persist in database
  const [created] = await db
    .insert(documentShareTokens)
    .values({
      documentId: doc.id,
      invoiceRequestId: req.id,
      tokenHash,
      createdBy: currentUser.id,
    })
    .returning();

  // 5. Audit log
  await logAuditEvent({
    userId: currentUser.id,
    action: "DOCUMENT_SHARE_TOKEN_CREATED",
    entityType: "document_share_tokens",
    entityId: created.id,
    metadata: {
      documentId: doc.id,
      invoiceRequestId: req.id,
      requestNumber: req.requestNumber,
    },
    ipAddress,
    dbOverride: db,
  });

  const baseUrl = origin ? origin.replace(/\/$/, "") : "";
  const shareUrl = `${baseUrl}/f/${rawToken}`;

  return {
    shareToken: {
      id: created.id,
      documentId: created.documentId,
      invoiceRequestId: created.invoiceRequestId,
      shareUrl,
      expiresAt: created.expiresAt ? created.expiresAt.toISOString() : null,
      createdAt: created.createdAt.toISOString(),
    },
    rawToken,
  };
}

export async function resolveSharedDocumentService(
  rawToken: string,
  ipAddress?: string,
  dbOverride?: unknown
): Promise<ResolvedShareStatus> {
  const db = (dbOverride as ReturnType<typeof getDb>) || getDb();
  if (!db) {
    throw new Error("Base de datos no disponible.");
  }

  if (!rawToken || typeof rawToken !== "string" || rawToken.length < 32) {
    throw new Error("NOT_FOUND: Enlace de factura inválido.");
  }

  // Compute SHA-256 hash to look up token securely
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  const tokenList = await db
    .select()
    .from(documentShareTokens)
    .where(eq(documentShareTokens.tokenHash, tokenHash))
    .limit(1);

  if (tokenList.length === 0) {
    throw new Error("NOT_FOUND: El enlace de la factura no existe o no es válido.");
  }

  const shareRecord = tokenList[0];

  if (shareRecord.revokedAt) {
    throw new Error("REVOKED: Este enlace de factura ha sido revocado.");
  }

  if (shareRecord.expiresAt && new Date(shareRecord.expiresAt) < new Date()) {
    throw new Error("EXPIRED: Este enlace de factura ha expirado.");
  }

  // Fetch document
  const docList = await db
    .select()
    .from(documents)
    .where(eq(documents.id, shareRecord.documentId))
    .limit(1);

  if (docList.length === 0) {
    throw new Error("NOT_FOUND: El documento asociado no fue encontrado.");
  }

  const doc = docList[0];

  // Fetch invoice request
  const reqList = await db
    .select()
    .from(invoiceRequests)
    .where(eq(invoiceRequests.id, shareRecord.invoiceRequestId))
    .limit(1);

  if (reqList.length === 0) {
    throw new Error("NOT_FOUND: La solicitud de factura asociada no existe.");
  }

  const req = reqList[0];

  // Check if invoice has been voided by Credit Note / Rectification
  if (doc.isVoided) {
    // Check if there is a replacement invoice
    const rectList = await db
      .select()
      .from(rectifications)
      .where(
        and(
          eq(rectifications.invoiceRequestId, req.id),
          eq(rectifications.originalInvoiceDocumentId, doc.id),
          eq(rectifications.status, "COMPLETED")
        )
      )
      .limit(1);

    const replacementDocId = rectList.length > 0 ? rectList[0].replacementInvoiceDocumentId : null;

    return {
      status: "SUPERSEDED",
      document: doc,
      invoiceRequest: req,
      replacementDocumentId: replacementDocId,
    };
  }

  // Active valid document: Retrieve file buffer directly from storage adapter
  const fileObj = await r2Client.getObject(doc.storageKey);
  const pdfData = fileObj?.body || Buffer.from("%PDF-1.4\n%EOF");

  return {
    status: "ACTIVE",
    document: doc,
    invoiceRequest: req,
    pdfData,
    contentType: fileObj?.contentType || "application/pdf",
    fileName: doc.fileName || `factura_${req.requestNumber}.pdf`,
  };
}
