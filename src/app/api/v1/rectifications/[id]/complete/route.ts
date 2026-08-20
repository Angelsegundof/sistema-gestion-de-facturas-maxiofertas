import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth";
import { verifyCsrfOrigin } from "@/lib/auth/csrf";
import { completeRectificationService } from "@/lib/services/rectifications";
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

  try {
    const rectification = await completeRectificationService(currentUser, id, ipAddress);

    return NextResponse.json<ApiResponse<{ rectification: SanitizedRectification }>>({
      success: true,
      data: {
        rectification,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error al finalizar la rectificación";

    if (msg.startsWith("NOT_FOUND")) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: { code: "NOT_FOUND", message: "La rectificación no existe." } },
        { status: 404 }
      );
    }

    if (msg.startsWith("FORBIDDEN")) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: { code: "FORBIDDEN", message: msg.replace("FORBIDDEN: ", "") } },
        { status: 403 }
      );
    }

    if (
      msg.startsWith("MISSING_CREDIT_NOTE") ||
      msg.startsWith("MISSING_REPLACEMENT_INVOICE") ||
      msg.startsWith("RECONCILIATION_MISMATCH")
    ) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: { code: "PRECONDITION_FAILED", message: msg } },
        { status: 422 }
      );
    }

    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: { code: "INTERNAL_ERROR", message: msg } },
      { status: 500 }
    );
  }
}
