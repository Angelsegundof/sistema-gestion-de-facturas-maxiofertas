import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq, desc, and, or, ilike, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  invoiceRequests,
  invoiceRequestItems,
  invoiceRequestStatuses,
  InvoiceRequestStatus,
} from "@/lib/db/schema";
import {
  requireAuth,
  requirePermission,
  verifyCsrfOrigin,
  AuthError,
} from "@/lib/auth";
import {
  createInvoiceRequestService,
  sanitizeInvoiceRequest,
} from "@/lib/services/invoice-requests";
import { ApiResponse, SanitizedInvoiceRequest } from "@/types";

const createInvoiceRequestSchema = z.object({
  customer: z.object({
    rut: z.string().min(1, "El RUT es requerido"),
    legalName: z.string().min(2, "La raz?n social debe tener al menos 2 caracteres").max(200),
    businessActivity: z.string().min(2, "El giro debe tener al menos 2 caracteres").max(250),
    phone: z.string().max(50).nullable().optional(),
    email: z.string().email("Correo con formato inv?lido").max(320).nullable().optional(),
  }),
  warehouseId: z.string().uuid().nullable().optional(),
  items: z
    .array(
      z.object({
        description: z.string().min(1, "La descripci?n del producto es requerida").max(500),
        quantity: z.number().int("La cantidad debe ser un entero").positive("La cantidad debe ser mayor a 0"),
        unitPriceGross: z
          .number()
          .int("El precio unitario debe ser un entero")
          .positive("El precio unitario debe ser mayor a 0"),
      })
    )
    .min(1, "Debe incluir al menos un producto")
    .max(100, "No se pueden incluir m?s de 100 productos"),
  notes: z.string().max(2000).nullable().optional(),
  duplicateOverride: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  // 1. Verificaci?n CSRF / Same-Origin
  const csrfCheck = verifyCsrfOrigin(request);
  if (!csrfCheck.valid) {
    return NextResponse.json<ApiResponse<null>>(
      {
        success: false,
        error: {
          code: "CSRF_FORBIDDEN",
          message: csrfCheck.reason || "Petici?n no permitida por pol?tica de origen.",
        },
      },
      { status: 403 }
    );
  }

  // 2. Autorizaci?n (REQUEST_CREATE: WAREHOUSE_USER, ADMIN)
  let currentUser;
  try {
    currentUser = await requirePermission("REQUEST_CREATE");
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: { code: "FORBIDDEN", message: "Acceso no autorizado" } },
      { status: 403 }
    );
  }

  const ipAddress = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
  const idempotencyKey = request.headers.get("idempotency-key") || request.headers.get("x-idempotency-key");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: { code: "INVALID_BODY", message: "Cuerpo de solicitud JSON inv?lido" } },
      { status: 400 }
    );
  }

  const parsed = createInvoiceRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResponse<null>>(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Los datos de la solicitud son incompletos o inv?lidos.",
          details: parsed.error.flatten().fieldErrors,
        },
      },
      { status: 400 }
    );
  }

  try {
    const result = await createInvoiceRequestService(currentUser, parsed.data, {
      ipAddress,
      idempotencyKey,
    });

    if (!result.success) {
      return NextResponse.json<ApiResponse<null>>(
        {
          success: false,
          error: {
            code: "POSSIBLE_DUPLICATE",
            message: "Existe una solicitud similar creada recientemente.",
            details: {
              candidate: result.duplicateCandidate,
            },
          },
        },
        { status: 409 }
      );
    }

    return NextResponse.json<ApiResponse<{ request: SanitizedInvoiceRequest }>>(
      {
        success: true,
        data: {
          request: result.request,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado al crear la solicitud.";
    return NextResponse.json<ApiResponse<null>>(
      {
        success: false,
        error: {
          code: "REQUEST_CREATION_FAILED",
          message,
        },
      },
      { status: 400 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    await requirePermission("REQUEST_VIEW_ALL");
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: { code: "FORBIDDEN", message: "Acceso no autorizado" } },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get("status") as InvoiceRequestStatus | null;
  const warehouseIdParam = searchParams.get("warehouseId");
  const searchParam = searchParams.get("search")?.trim();
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "25", 10)));
  const offset = (page - 1) * pageSize;

  const db = getDb();
  if (!db) {
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: { code: "SERVICE_UNAVAILABLE", message: "Base de datos no disponible" } },
      { status: 503 }
    );
  }

  const conditions = [];

  if (statusParam && invoiceRequestStatuses.includes(statusParam)) {
    conditions.push(eq(invoiceRequests.status, statusParam));
  }

  if (warehouseIdParam) {
    conditions.push(eq(invoiceRequests.warehouseId, warehouseIdParam));
  }

  if (searchParam) {
    conditions.push(
      or(
        ilike(invoiceRequests.requestNumber, `%${searchParam}%`),
        ilike(invoiceRequests.customerRutSnapshot, `%${searchParam}%`),
        ilike(invoiceRequests.customerLegalNameSnapshot, `%${searchParam}%`)
      )
    );
  }

  const query = db
    .select()
    .from(invoiceRequests)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(invoiceRequests.createdAt))
    .limit(pageSize)
    .offset(offset);

  const requestList = await query;
  const sanitizedList: SanitizedInvoiceRequest[] = requestList.map((r) => sanitizeInvoiceRequest(r));

  return NextResponse.json<ApiResponse<{ requests: SanitizedInvoiceRequest[]; page: number; pageSize: number }>>(
    {
      success: true,
      data: {
        requests: sanitizedList,
        page,
        pageSize,
      },
    },
    { status: 200 }
  );
}
