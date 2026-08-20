import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth";
import { getRectificationsQueueService } from "@/lib/services/rectifications";
import { RectificationStatus } from "@/lib/db/schema";
import { ApiResponse, SanitizedRectification } from "@/types";

export async function GET(request: NextRequest) {
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

  const { searchParams } = new URL(request.url);
  const statusParam = (searchParams.get("status") as RectificationStatus | "ALL") || "ALL";
  const search = searchParams.get("search") || undefined;
  const page = parseInt(searchParams.get("page") || "1", 10);
  const pageSize = parseInt(searchParams.get("pageSize") || "20", 10);

  try {
    const data = await getRectificationsQueueService(currentUser, {
      status: statusParam,
      search,
      page,
      pageSize,
    });

    return NextResponse.json<
      ApiResponse<{
        rectifications: SanitizedRectification[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
      }>
    >({
      success: true,
      data,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error al obtener rectificaciones";

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
