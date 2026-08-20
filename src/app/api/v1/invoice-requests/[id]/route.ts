import { NextRequest, NextResponse } from "next/server";
import { eq, and, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  invoiceRequests,
  invoiceRequestItems,
  requestCorrections,
  documents,
  rectifications,
  warehouses,
  users,
} from "@/lib/db/schema";
import { requireAuth, AuthError } from "@/lib/auth";
import { sanitizeQueueInvoiceRequest } from "@/lib/services/invoice-queue";
import { sanitizeDocument } from "@/lib/services/invoice-documents";
import { sanitizeRectification } from "@/lib/services/rectifications";
import { r2Client } from "@/lib/r2/client";
import { ApiResponse, SanitizedInvoiceRequest } from "@/types";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  let currentUser;
  try {
    currentUser = await requireAuth();
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: { code: "UNAUTHORIZED", message: "Acceso no autorizado" } },
      { status: 401 }
    );
  }

  const { id } = await context.params;
  const db = getDb();
  if (!db) {
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: { code: "SERVICE_UNAVAILABLE", message: "Base de datos no disponible" } },
      { status: 503 }
    );
  }

  const requestList = await db
    .select({
      request: invoiceRequests,
      warehouseName: warehouses.name,
      warehouseCode: warehouses.code,
      requesterName: users.name,
    })
    .from(invoiceRequests)
    .leftJoin(warehouses, eq(invoiceRequests.warehouseId, warehouses.id))
    .leftJoin(users, eq(invoiceRequests.requestedBy, users.id))
    .where(eq(invoiceRequests.id, id))
    .limit(1);

  if (requestList.length === 0) {
    return NextResponse.json<ApiResponse<null>>(
      {
        success: false,
        error: {
          code: "REQUEST_NOT_FOUND",
          message: "La solicitud de factura especificada no existe.",
        },
      },
      { status: 404 }
    );
  }

  const targetReq = requestList[0].request;

  // IDOR Protection: WAREHOUSE_USER can ONLY access requests created by themselves
  if (currentUser.role === "WAREHOUSE_USER" && targetReq.requestedBy !== currentUser.id) {
    return NextResponse.json<ApiResponse<null>>(
      {
        success: false,
        error: {
          code: "REQUEST_NOT_FOUND",
          message: "La solicitud de factura especificada no existe o no tiene permisos para consultarla.",
        },
      },
      { status: 404 }
    );
  }

  const itemsList = await db
    .select()
    .from(invoiceRequestItems)
    .where(eq(invoiceRequestItems.invoiceRequestId, targetReq.id))
    .orderBy(invoiceRequestItems.lineNumber);

  const correctionsList = await db
    .select({
      id: requestCorrections.id,
      invoiceRequestId: requestCorrections.invoiceRequestId,
      reason: requestCorrections.reason,
      comment: requestCorrections.comment,
      requestedBy: requestCorrections.requestedBy,
      resolvedBy: requestCorrections.resolvedBy,
      createdAt: requestCorrections.createdAt,
      resolvedAt: requestCorrections.resolvedAt,
      requestedByName: users.name,
    })
    .from(requestCorrections)
    .leftJoin(users, eq(requestCorrections.requestedBy, users.id))
    .where(eq(requestCorrections.invoiceRequestId, targetReq.id))
    .orderBy(desc(requestCorrections.createdAt));

  const sanitized = sanitizeQueueInvoiceRequest(
    targetReq,
    itemsList,
    correctionsList.map((c) => ({
      id: c.id,
      invoiceRequestId: c.invoiceRequestId,
      reason: c.reason,
      comment: c.comment,
      requestedBy: c.requestedBy,
      resolvedBy: c.resolvedBy,
      createdAt: c.createdAt,
      resolvedAt: c.resolvedAt,
    }))
  );

  sanitized.requesterName = requestList[0].requesterName || "Solicitante";
  if (requestList[0].warehouseName && requestList[0].warehouseCode) {
    sanitized.warehouse = {
      id: targetReq.warehouseId,
      name: requestList[0].warehouseName,
      code: requestList[0].warehouseCode,
      active: true,
      createdAt: targetReq.createdAt.toISOString(),
      updatedAt: targetReq.updatedAt.toISOString(),
    };
  }

  // Populate user names on corrections
  if (sanitized.corrections && sanitized.corrections.length > 0) {
    sanitized.corrections = sanitized.corrections.map((c, idx) => ({
      ...c,
      requestedByName: correctionsList[idx]?.requestedByName || "Ejecutor",
    }));
  }

  // Populate attached invoice document if present (prioritize latest valid/replacement document)
  const docList = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.invoiceRequestId, targetReq.id),
        eq(documents.documentType, "INVOICE")
      )
    )
    .orderBy(desc(documents.createdAt));

  if (docList.length > 0) {
    const activeDoc = docList.find((d) => !d.isVoided) || docList[0];
    const accessUrl = await r2Client.generatePresignedDownloadUrl({
      key: activeDoc.storageKey,
      expiresInSeconds: 900,
    });
    sanitized.document = sanitizeDocument(activeDoc, accessUrl);
  }

  // Populate rectifications if any
  const rectsList = await db
    .select()
    .from(rectifications)
    .where(eq(rectifications.invoiceRequestId, targetReq.id))
    .orderBy(desc(rectifications.requestedAt));

  if (rectsList.length > 0) {
    sanitized.rectifications = rectsList.map((r) => sanitizeRectification(r));
    const active = rectsList.find((r) =>
      ["REQUESTED", "IN_PROGRESS", "CREDIT_NOTE_REGISTERED", "NEW_INVOICE_PENDING"].includes(r.status)
    );
    sanitized.activeRectification = active ? sanitizeRectification(active) : null;
  }

  return NextResponse.json<ApiResponse<{ request: SanitizedInvoiceRequest }>>(
    {
      success: true,
      data: {
        request: sanitized,
      },
    },
    { status: 200 }
  );
}
