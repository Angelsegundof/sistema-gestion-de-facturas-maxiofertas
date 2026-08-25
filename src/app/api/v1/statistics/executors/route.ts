import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth";
import { getExecutorStatisticsService } from "@/lib/services/statistics";
import { ApiResponse } from "@/types";
import { ExecutorStatisticsResponse } from "@/domain/types";

export const dynamic = "force-dynamic";

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
      { success: false, error: { code: "UNAUTHORIZED", message: "Acceso no autorizado." } },
      { status: 401 }
    );
  }

  // Strict server-side RBAC: Only ADMIN and MANAGEMENT can view executor performance metrics
  if (currentUser.role !== "ADMIN" && currentUser.role !== "MANAGEMENT") {
    return NextResponse.json<ApiResponse<null>>(
      {
        success: false,
        error: {
          code: "FORBIDDEN",
          message: "No tienes permisos para consultar las estadísticas de ejecutores.",
        },
      },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const monthParam = searchParams.get("month");
  const yearParam = searchParams.get("year");

  const month = monthParam ? parseInt(monthParam, 10) : undefined;
  const year = yearParam ? parseInt(yearParam, 10) : undefined;

  try {
    const data = await getExecutorStatisticsService(currentUser, {
      month,
      year,
    });

    return NextResponse.json<ApiResponse<ExecutorStatisticsResponse>>({
      success: true,
      data,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error al obtener estadísticas de ejecutores.";

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
