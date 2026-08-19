import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { ApiResponse, HealthCheckData } from "@/types";

export const dynamic = "force-dynamic";

export async function GET() {
  let dbStatus: "connected" | "disconnected" | "unconfigured" = "unconfigured";

  if (db) {
    try {
      await db.execute(sql`SELECT 1`);
      dbStatus = "connected";
    } catch {
      dbStatus = "disconnected";
    }
  }

  const responseData: ApiResponse<HealthCheckData> = {
    success: true,
    data: {
      status: "ok",
      service: "maxiofertas-facturacion",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      database: dbStatus,
    },
  };

  return NextResponse.json(responseData, { status: 200 });
}
