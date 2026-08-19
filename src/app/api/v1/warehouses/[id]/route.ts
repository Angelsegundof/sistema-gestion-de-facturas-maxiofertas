import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { warehouses } from "@/lib/db/schema";
import {
  requirePermission,
  verifyCsrfOrigin,
  logAuditEvent,
  AuthError,
} from "@/lib/auth";
import { ApiResponse, SanitizedWarehouse } from "@/types";

const updateWarehouseSchema = z.object({
  name: z.string().min(2).max(150).optional(),
  code: z.string().min(2).max(50).optional(),
  active: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  // 1. Verificaci?n CSRF / Same-Origin
  const csrfCheck = verifyCsrfOrigin(request);
  if (!csrfCheck.valid) {
    return NextResponse.json<ApiResponse<null>>(
      {
        success: false,
        error: {
          code: "CSRF_FORBIDDEN",
          message: csrfCheck.reason || "Petici?n no permitida por pol?tica de origen.",
        },
      },
      { status: 403 }
    );
  }

  // 2. Autorizaci?n (ADMIN)
  let currentUser;
  try {
    currentUser = await requirePermission("WAREHOUSE_MANAGE");
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: { code: "FORBIDDEN", message: "Acceso no autorizado" } },
      { status: 403 }
    );
  }

  const { id } = await context.params;
  const ipAddress = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: { code: "INVALID_BODY", message: "Cuerpo de solicitud inv?lido" } },
      { status: 400 }
    );
  }

  const parsed = updateWarehouseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResponse<null>>(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Datos de actualizaci?n inv?lidos.",
          details: parsed.error.flatten().fieldErrors,
        },
      },
      { status: 400 }
    );
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: { code: "SERVICE_UNAVAILABLE", message: "Base de datos no disponible" } },
      { status: 503 }
    );
  }

  const targetList = await db.select().from(warehouses).where(eq(warehouses.id, id)).limit(1);
  if (targetList.length === 0) {
    return NextResponse.json<ApiResponse<null>>(
      {
        success: false,
        error: {
          code: "WAREHOUSE_NOT_FOUND",
          message: "La bodega especificada no existe.",
        },
      },
      { status: 404 }
    );
  }

  const targetWarehouse = targetList[0];
  const updateData: Partial<typeof warehouses.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (parsed.data.name !== undefined) {
    updateData.name = parsed.data.name.trim();
  }
  if (parsed.data.code !== undefined) {
    updateData.code = parsed.data.code.trim().toUpperCase();
  }
  if (parsed.data.active !== undefined) {
    updateData.active = parsed.data.active;
  }

  const [updatedWarehouse] = await db
    .update(warehouses)
    .set(updateData)
    .where(eq(warehouses.id, id))
    .returning();

  await logAuditEvent({
    userId: currentUser.id,
    action: parsed.data.active === false ? "USER_DISABLED" : "USER_ROLE_CHANGED", // Generic audit actions
    entityType: "warehouses",
    entityId: id,
    metadata: {
      actionType:
        parsed.data.active === false
          ? "WAREHOUSE_DISABLED"
          : parsed.data.active === true
          ? "WAREHOUSE_ENABLED"
          : "WAREHOUSE_UPDATED",
      oldValues: { name: targetWarehouse.name, code: targetWarehouse.code, active: targetWarehouse.active },
      newValues: { name: updatedWarehouse.name, code: updatedWarehouse.code, active: updatedWarehouse.active },
      modifiedBy: currentUser.email,
    },
    ipAddress,
  });

  const sanitized: SanitizedWarehouse = {
    id: updatedWarehouse.id,
    code: updatedWarehouse.code,
    name: updatedWarehouse.name,
    active: updatedWarehouse.active,
    createdAt: updatedWarehouse.createdAt.toISOString(),
    updatedAt: updatedWarehouse.updatedAt.toISOString(),
  };

  return NextResponse.json<ApiResponse<{ warehouse: SanitizedWarehouse }>>(
    {
      success: true,
      data: { warehouse: sanitized },
    },
    { status: 200 }
  );
}
