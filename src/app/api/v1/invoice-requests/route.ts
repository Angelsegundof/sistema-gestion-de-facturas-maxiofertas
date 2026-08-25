import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requirePermission,
  verifyCsrfOrigin,
  AuthError,
} from "@/lib/auth";
import {
  createInvoiceRequestService,
} from "@/lib/services/invoice-requests";
import {
  getQueueRequestsService,
  getQueueCountersService,
} from "@/lib/services/invoice-queue";
import {
  invoiceRequestStatuses,
  InvoiceRequestStatus,
} from "@/lib/db/schema";
import { ApiResponse, SanitizedInvoiceRequest, QueueSummaryCounters } from "@/types";

const createInvoiceRequestSchema = z.object({
  customer: z.object({
    rut: z.string().min(1, "El RUT es requerido"),
    legalName: z.string().min(2, "La razón social debe tener al menos 2 caracteres").max(200),
    businessActivity: z.string().min(2, "El giro debe tener al menos 2 caracteres").max(250),
    phone: z.string().max(50).nullable().optional(),
    email: z.string().email("Correo con formato inválido").max(320).nullable().optional(),
  }),
  warehouseId: z.string().uuid().nullable().optional(),
  items: z
    .array(
      z.object({
        description: z.string().min(1, "La descripción del producto es requerida").max(500),
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
  // 1. Verificación CSRF / Same-Origin
  const csrfCheck = verifyCsrfOrigin(request);
  if (!csrfCheck.valid) {
    return NextResponse.json<ApiResponse<null>>(
      {
        success: false,
        error: {
          code: "CSRF_FORBIDDEN",
          message: csrfCheck.reason || "Petición no permitida por política de origen.",
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
      { success: false, error: { code: "INVALID_BODY", message: "Cuerpo de solicitud JSON inválido" } },
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
          message: "Los datos de la solicitud son incompletos o inválidos.",
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
    if (message.startsWith("IDEMPOTENCY_PAYLOAD_MISMATCH")) {
      return NextResponse.json<ApiResponse<null>>(
        {
          success: false,
          error: {
            code: "IDEMPOTENCY_PAYLOAD_MISMATCH",
            message,
          },
        },
        { status: 409 }
      );
    }
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
  const warehouseIdParam = searchParams.get("warehouseId") || undefined;
  const assignedToParam = searchParams.get("assignedTo") || undefined;
  const searchParam = searchParams.get("search")?.trim() || undefined;
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "25", 10)));
  const includeCounters = searchParams.get("counters") === "true";
  const todayOnly = searchParams.get("todayOnly") === "true";

  const validStatus = statusParam && invoiceRequestStatuses.includes(statusParam) ? statusParam : undefined;

  try {
    const queueData = await getQueueRequestsService({
      status: validStatus,
      warehouseId: warehouseIdParam,
      assignedTo: assignedToParam,
      search: searchParam,
      page,
      pageSize,
      todayOnly,
    });

    let counters: QueueSummaryCounters | undefined = undefined;
    if (includeCounters) {
      counters = await getQueueCountersService(warehouseIdParam);
    }

    return NextResponse.json<
      ApiResponse<{
        requests: SanitizedInvoiceRequest[];
        total: number;
        page: number;
        pageSize: number;
        counters?: QueueSummaryCounters;
      }>
    >(
      {
        success: true,
        data: {
          ...queueData,
          counters,
        },
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: { code: "SERVICE_UNAVAILABLE", message: "Base de datos no disponible" } },
      { status: 503 }
    );
  }
}
