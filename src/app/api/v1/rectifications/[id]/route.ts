import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth";
import { getRectificationByIdService } from "@/lib/services/rectifications";
import { ApiResponse, SanitizedRectification } from "@/types";

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

  try {
    const rectification = await getRectificationByIdService(currentUser, id);

    return NextResponse.json<ApiResponse<{ rectification: SanitizedRectification }>>({
      success: true,
      data: {
        rectification,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error al obtener rectificación";

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

    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: { code: "INTERNAL_ERROR", message: msg } },
      { status: 500 }
    );
  }
}
