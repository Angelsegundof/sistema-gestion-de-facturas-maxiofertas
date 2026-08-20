import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth";
import { hasPermission } from "@/domain/permissions";
import { getMonthlyEvolutionService } from "@/lib/services/statistics";
import { ApiResponse, MonthlyEvolutionItem } from "@/types";

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

  if (!hasPermission(currentUser.role, "STATS_VIEW")) {
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: { code: "FORBIDDEN", message: "No tienes permisos para consultar estadísticas." } },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const monthsParam = searchParams.get("months");
  const warehouseId = searchParams.get("warehouseId") || undefined;

  const months = monthsParam ? parseInt(monthsParam, 10) : 12;

  try {
    const data = await getMonthlyEvolutionService(currentUser, {
      months,
      warehouseId,
    });

    return NextResponse.json<
      ApiResponse<{
        history: MonthlyEvolutionItem[];
      }>
    >({
      success: true,
      data,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error al obtener evolución mensual";

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
