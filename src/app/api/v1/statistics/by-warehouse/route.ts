import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth";
import { hasPermission } from "@/domain/permissions";
import { getStatisticsByWarehouseService } from "@/lib/services/statistics";
import { ApiResponse, WarehouseStatistics } from "@/types";

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
  const monthParam = searchParams.get("month");
  const yearParam = searchParams.get("year");
  const warehouseId = searchParams.get("warehouseId") || undefined;
  const startDate = searchParams.get("startDate") || undefined;
  const endDate = searchParams.get("endDate") || undefined;

  const month = monthParam ? parseInt(monthParam, 10) : undefined;
  const year = yearParam ? parseInt(yearParam, 10) : undefined;

  try {
    const data = await getStatisticsByWarehouseService(currentUser, {
      month,
      year,
      warehouseId,
      startDate,
      endDate,
    });

    return NextResponse.json<
      ApiResponse<{
        warehouses: WarehouseStatistics[];
        totalGross: number;
      }>
    >({
      success: true,
      data,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error al obtener estadísticas por bodega";

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
