import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth";
import { createDocumentShareTokenService } from "@/lib/services/document-share";
import { SanitizedDocumentShareToken } from "@/domain/types";
import { ApiResponse } from "@/types";

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

  const { id } = await context.params;
  const ipAddress = request.headers.get("x-forwarded-for") || undefined;
  const origin = request.nextUrl.origin;

  try {
    const result = await createDocumentShareTokenService(
      currentUser,
      id,
      origin,
      ipAddress
    );

    return NextResponse.json<
      ApiResponse<{
        shareToken: SanitizedDocumentShareToken;
        shareUrl: string;
      }>
    >(
      {
        success: true,
        data: {
          shareToken: result.shareToken,
          shareUrl: result.shareToken.shareUrl,
        },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error al generar enlace de factura";

    if (msg.startsWith("NOT_FOUND")) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: { code: "DOCUMENT_NOT_FOUND", message: "El documento solicitado no existe." } },
        { status: 404 }
      );
    }

    if (msg.startsWith("FORBIDDEN")) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: { code: "FORBIDDEN", message: msg.replace("FORBIDDEN: ", "") } },
        { status: 403 }
      );
    }

    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: { code: "INTERNAL_ERROR", message: msg } },
      { status: 500 }
    );
  }
}
