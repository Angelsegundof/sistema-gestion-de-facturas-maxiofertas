import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, AuthError } from "@/lib/auth";
import { verifyCsrfOrigin } from "@/lib/auth/csrf";
import { updateCustomerDeliveryStatusService } from "@/lib/services/customer-delivery";
import { ApiResponse, SanitizedInvoiceRequest } from "@/types";

export const dynamic = "force-dynamic";

const deliveryStatusSchema = z
  .object({
    status: z.enum(["PENDING", "SENT"]).optional(),
    deliveryStatus: z.enum(["PENDING", "SENT"]).optional(),
  })
  .refine((d) => d.status !== undefined || d.deliveryStatus !== undefined, {
    message: "Debes especificar el estado de entrega (PENDING o SENT).",
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
        error: {
          code: "CSRF_FORBIDDEN",
          message: csrfCheck.reason || "Petición no permitida por política de origen.",
        },
      },
      { status: 403 }
    );
  }

  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json<ApiResponse<null>>(
      {
        success: false,
        error: {
          code: "INVALID_JSON",
          message: "El cuerpo de la solicitud no es un JSON válido.",
        },
      },
      { status: 400 }
    );
  }

  const parseResult = deliveryStatusSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json<ApiResponse<null>>(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: parseResult.error.issues[0]?.message || "Datos inválidos.",
        },
      },
      { status: 400 }
    );
  }

  const targetStatus = (parseResult.data.deliveryStatus || parseResult.data.status) as "PENDING" | "SENT";
  const ipAddress = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
  const userAgent = request.headers.get("user-agent") || undefined;

  try {
    const updatedRequest = await updateCustomerDeliveryStatusService(
      currentUser,
      id,
      targetStatus,
      {
        ipAddress,
        userAgent,
      }
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
    const message = error instanceof Error ? error.message : "Error al actualizar estado de entrega";

    if (message.startsWith("NOT_FOUND")) {
      return NextResponse.json<ApiResponse<null>>(
        {
          success: false,
          error: {
            code: "REQUEST_NOT_FOUND",
            message: message.replace("NOT_FOUND: ", ""),
          },
        },
        { status: 404 }
      );
    }

    if (message.startsWith("FORBIDDEN")) {
      return NextResponse.json<ApiResponse<null>>(
        {
          success: false,
          error: {
            code: "FORBIDDEN",
            message: message.replace("FORBIDDEN: ", ""),
          },
        },
        { status: 403 }
      );
    }

    if (message.startsWith("CONFLICT")) {
      return NextResponse.json<ApiResponse<null>>(
        {
          success: false,
          error: {
            code: "INVALID_STATE_FOR_DELIVERY",
            message: message.replace("CONFLICT: ", ""),
          },
        },
        { status: 409 }
      );
    }

    return NextResponse.json<ApiResponse<null>>(
      {
        success: false,
        error: {
          code: "DELIVERY_UPDATE_FAILED",
          message,
        },
      },
      { status: 500 }
    );
  }
}
