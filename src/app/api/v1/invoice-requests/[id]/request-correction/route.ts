import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, AuthError } from "@/lib/auth";
import { verifyCsrfOrigin } from "@/lib/auth/csrf";
import { requestCorrectionReasons } from "@/lib/db/schema";
import { requestCorrectionService } from "@/lib/services/invoice-queue";
import { ApiResponse, SanitizedInvoiceRequest } from "@/types";

const requestCorrectionSchema = z.object({
  reason: z.enum(requestCorrectionReasons, {
    message: "El motivo de corrección seleccionado no es válido.",
  }),
  comment: z.string().max(2000, "El comentario no puede superar los 2.000 caracteres.").optional().nullable(),
});

export async function POST(
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
      { success: false, error: { code: "CSRF_ERROR", message: csrfCheck.reason || "Error de validación CSRF" } },
      { status: 403 }
    );
  }

  if (currentUser.role !== "INVOICE_EXECUTOR" && currentUser.role !== "ADMIN") {
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: { code: "FORBIDDEN", message: "No tienes permisos para observar solicitudes." } },
      { status: 403 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: { code: "INVALID_JSON", message: "Cuerpo de solicitud inválido." } },
      { status: 400 }
    );
  }

  const parseResult = requestCorrectionSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json<ApiResponse<null>>(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Datos de observación inválidos.",
          details: { errors: parseResult.error.format() },
        },
      },
      { status: 422 }
    );
  }

  const { reason, comment } = parseResult.data;
  if (reason === "OTHER" && (!comment || !comment.trim())) {
    return NextResponse.json<ApiResponse<null>>(
      {
        success: false,
        error: {
          code: "COMMENT_REQUIRED",
          message: "Debes ingresar un comentario explicativo cuando el motivo es 'Otro'.",
        },
      },
      { status: 422 }
    );
  }

  const { id } = await context.params;
  const ipAddress = request.headers.get("x-forwarded-for") || undefined;

  try {
    const updatedRequest = await requestCorrectionService(
      currentUser,
      id,
      { reason, comment: comment || null },
      ipAddress
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
    const msg = error instanceof Error ? error.message : "Error al observar la solicitud";

    if (msg.startsWith("NOT_FOUND")) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: { code: "REQUEST_NOT_FOUND", message: "La solicitud no existe." } },
        { status: 404 }
      );
    }

    if (msg.startsWith("FORBIDDEN")) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: { code: "FORBIDDEN", message: msg.replace("FORBIDDEN: ", "") } },
        { status: 403 }
      );
    }

    if (msg.startsWith("INVALID_STATE")) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: { code: "INVALID_STATE", message: msg.replace("INVALID_STATE: ", "") } },
        { status: 409 }
      );
    }

    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: { code: "INTERNAL_ERROR", message: msg } },
      { status: 500 }
    );
  }
}
