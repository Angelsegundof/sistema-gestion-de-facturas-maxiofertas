import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth";
import { verifyCsrfOrigin } from "@/lib/auth/csrf";
import { completeInvoiceRequestService } from "@/lib/services/invoice-documents";
import { ApiResponse, SanitizedInvoiceRequest } from "@/types";

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
      { success: false, error: { code: "CSRF_ERROR", message: csrfCheck.reason || "Error de validaci?n CSRF" } },
      { status: 403 }
    );
  }

  if (currentUser.role !== "INVOICE_EXECUTOR" && currentUser.role !== "ADMIN") {
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: { code: "FORBIDDEN", message: "No tienes permisos para finalizar facturas." } },
      { status: 403 }
    );
  }

  const { id } = await context.params;
  const ipAddress = request.headers.get("x-forwarded-for") || undefined;

  try {
    const completedRequest = await completeInvoiceRequestService(
      currentUser,
      id,
      ipAddress
    );

    return NextResponse.json<ApiResponse<{ request: SanitizedInvoiceRequest }>>(
      {
        success: true,
        data: {
          request: completedRequest,
        },
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error al finalizar la factura";

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

    if (msg.startsWith("RECONCILIATION_MISMATCH") || msg.startsWith("MISSING_DOCUMENT")) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: { code: "PRECONDITION_FAILED", message: msg } },
        { status: 409 }
      );
    }

    if (msg.startsWith("INVALID_STATE")) {
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
