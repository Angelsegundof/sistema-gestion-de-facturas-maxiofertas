import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth";
import { verifyCsrfOrigin } from "@/lib/auth/csrf";
import { requestRectificationService } from "@/lib/services/rectifications";
import { RectificationReason } from "@/lib/db/schema";
import { ApiResponse, SanitizedRectification } from "@/types";

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

  const { id } = await context.params;
  const ipAddress = request.headers.get("x-forwarded-for") || undefined;

  let body: { reason?: RectificationReason; comment?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: { code: "INVALID_JSON", message: "Cuerpo de solicitud inválido." } },
      { status: 400 }
    );
  }

  if (!body.reason) {
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: { code: "MISSING_REASON", message: "Debes especificar el motivo del cambio." } },
      { status: 400 }
    );
  }

  try {
    const rectification = await requestRectificationService(
      currentUser,
      id,
      {
        reason: body.reason,
        comment: body.comment,
      },
      ipAddress
    );

    return NextResponse.json<ApiResponse<{ rectification: SanitizedRectification }>>(
      {
        success: true,
        data: {
          rectification,
        },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error al solicitar rectificación";

    if (msg.startsWith("NOT_FOUND")) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: { code: "REQUEST_NOT_FOUND", message: "La solicitud de factura no existe." } },
        { status: 404 }
      );
    }

    if (msg.startsWith("FORBIDDEN")) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: { code: "FORBIDDEN", message: msg.replace("FORBIDDEN: ", "") } },
        { status: 403 }
      );
    }

    if (msg.startsWith("INVALID_STATE") || msg.startsWith("MISSING_DOCUMENT")) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: { code: "INVALID_STATE", message: msg } },
        { status: 409 }
      );
    }

    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: { code: "INTERNAL_ERROR", message: msg } },
      { status: 500 }
    );
  }
}
