import { NextRequest, NextResponse } from "next/server";
import { eq, and, desc, asc } from "drizzle-orm";
import { getDb, ensureDbReady } from "@/lib/db";
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
import { verifyCsrfOrigin } from "@/lib/auth/csrf";
import { sanitizeQueueInvoiceRequest } from "@/lib/services/invoice-queue";
import { sanitizeDocument } from "@/lib/services/invoice-documents";
import { sanitizeRectification } from "@/lib/services/rectifications";
import { updatePendingInvoiceRequestService } from "@/lib/services/invoice-requests";
import { hasPermission } from "@/domain/permissions";
import { r2Client } from "@/lib/r2/client";
import { ApiResponse, SanitizedInvoiceRequest } from "@/types";
import { z } from "zod";

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

  await ensureDbReady();
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

  // Populate attached invoice documents if present (prioritize valid/non-voided documents)
  const docList = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.invoiceRequestId, targetReq.id),
        eq(documents.documentType, "INVOICE")
      )
    )
    .orderBy(asc(documents.documentNumber), desc(documents.createdAt));

  if (docList.length > 0) {
    const activeDocs = docList.filter((d) => !d.isVoided);
    const docsToSanitize = activeDocs.length > 0 ? activeDocs : docList;

    const sanitizedDocsPromises = docsToSanitize.map(async (doc) => {
      const accessUrl = r2Client.isConfigured()
        ? await r2Client.generatePresignedDownloadUrl({
            key: doc.storageKey,
            expiresInSeconds: 900,
          })
        : `/api/v1/documents/${doc.id}/access?stream=true`;
      return sanitizeDocument(doc, accessUrl);
    });

    const sanitizedDocs = await Promise.all(sanitizedDocsPromises);
    sanitizedDocs.sort((a, b) => (a.documentNumber || 1) - (b.documentNumber || 1));
    sanitized.documents = sanitizedDocs;
    sanitized.document = sanitizedDocs[0] || null;
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

const editPendingRequestSchema = z.object({
  customer: z.object({
    rut: z.string().min(1, "El RUT del cliente es obligatorio"),
    legalName: z.string().min(2, "La razón social debe tener al menos 2 caracteres").max(200),
    businessActivity: z.string().min(2, "El giro comercial debe tener al menos 2 caracteres").max(200),
    phone: z.string().nullable().optional(),
    email: z.string().email("Correo electrónico inválido").nullable().optional().or(z.literal("")),
  }),
  items: z
    .array(
      z.object({
        description: z.string().min(1, "La descripción del producto es obligatoria"),
        quantity: z.number().int().positive("La cantidad debe ser mayor a 0"),
        unitPriceGross: z.number().int().positive("El precio unitario debe ser mayor a 0"),
      })
    )
    .min(1, "Debe incluir al menos un producto"),
  notes: z.string().nullable().optional(),
});

export async function PATCH(
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

  const csrfCheck = verifyCsrfOrigin(request);
  if (!csrfCheck.valid) {
    return NextResponse.json<ApiResponse<null>>(
      {
        success: false,
        error: { code: "CSRF_ERROR", message: csrfCheck.reason || "Error de validación CSRF" },
      },
      { status: 403 }
    );
  }

  if (!hasPermission(currentUser.role, "REQUEST_EDIT_PENDING")) {
    return NextResponse.json<ApiResponse<null>>(
      {
        success: false,
        error: { code: "FORBIDDEN", message: "No tienes permisos para modificar solicitudes de facturación." },
      },
      { status: 403 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: { code: "INVALID_JSON", message: "El cuerpo de la solicitud no es un JSON válido." } },
      { status: 400 }
    );
  }

  const validation = editPendingRequestSchema.safeParse(body);
  if (!validation.success) {
    const firstError = validation.error.issues[0]?.message || "Datos de solicitud inválidos.";
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: { code: "VALIDATION_ERROR", message: firstError } },
      { status: 400 }
    );
  }

  const { id } = await context.params;
  const ipAddress = request.headers.get("x-forwarded-for") || undefined;

  try {
    const updatedRequest = await updatePendingInvoiceRequestService(
      currentUser,
      id,
      validation.data,
      { ipAddress }
    );

    return NextResponse.json<ApiResponse<{ request: SanitizedInvoiceRequest }>>(
      {
        success: true,
        data: {
          request: updatedRequest,
        },
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    const err = error as Error;
    const msg = err.message || "Error al actualizar la solicitud.";

    if (msg.includes("CONFLICT_STATE")) {
      return NextResponse.json<ApiResponse<null>>(
        {
          success: false,
          error: {
            code: "CONFLICT_STATE",
            message: "Esta solicitud ya comenzó a ser procesada y no puede modificarse. Actualiza la página para continuar.",
          },
        },
        { status: 409 }
      );
    }

    if (msg.includes("NOT_FOUND")) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: { code: "NOT_FOUND", message: "La solicitud no existe." } },
        { status: 404 }
      );
    }

    if (msg.includes("FORBIDDEN")) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: { code: "FORBIDDEN", message: "No tienes permisos para realizar esta acción." } },
        { status: 403 }
      );
    }

    if (msg.includes("VALIDATION_ERROR")) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: { code: "VALIDATION_ERROR", message: msg.replace("VALIDATION_ERROR: ", "") } },
        { status: 400 }
      );
    }

    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Error interno al actualizar la solicitud." } },
      { status: 500 }
    );
  }
}
