import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq, asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { warehouses, Warehouse } from "@/lib/db/schema";
import {
  requireAuth,
  requirePermission,
  verifyCsrfOrigin,
  logAuditEvent,
  AuthError,
} from "@/lib/auth";
import { ApiResponse, SanitizedWarehouse } from "@/types";

const createWarehouseSchema = z.object({
  code: z.string().min(2, "El código debe tener al menos 2 caracteres").max(50),
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres").max(150),
});

export async function GET() {
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

  const db = getDb();
  if (!db) {
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: { code: "SERVICE_UNAVAILABLE", message: "Base de datos no disponible" } },
      { status: 503 }
    );
  }

  let warehouseList: Warehouse[] = [];

  if (currentUser.role === "WAREHOUSE_USER") {
    // Solicitante / Bodega: S?lo ve la bodega asignada en su contexto de autocompletado
    if (currentUser.warehouseId) {
      warehouseList = await db
        .select()
        .from(warehouses)
        .where(eq(warehouses.id, currentUser.warehouseId))
        .limit(1);
    }
  } else if (currentUser.role === "ADMIN") {
    // Administrador: Ve todas las bodegas (activas e inactivas)
    warehouseList = await db
      .select()
      .from(warehouses)
      .orderBy(asc(warehouses.name));
  } else {
    // Otros roles (INVOICE_EXECUTOR, MANAGEMENT): Ven todas las bodegas activas
    warehouseList = await db
      .select()
      .from(warehouses)
      .where(eq(warehouses.active, true))
      .orderBy(asc(warehouses.name));
  }

  const sanitized: SanitizedWarehouse[] = warehouseList.map((w) => ({
    id: w.id,
    code: w.code,
    name: w.name,
    active: w.active,
    createdAt: w.createdAt.toISOString(),
    updatedAt: w.updatedAt.toISOString(),
  }));

  return NextResponse.json<ApiResponse<{ warehouses: SanitizedWarehouse[] }>>(
    {
      success: true,
      data: { warehouses: sanitized },
    },
    { status: 200 }
  );
}

export async function POST(request: NextRequest) {
  // 1. Verificación CSRF / Same-Origin
  const csrfCheck = verifyCsrfOrigin(request);
  if (!csrfCheck.valid) {
    return NextResponse.json<ApiResponse<null>>(
      {
        success: false,
        error: {
          code: "CSRF_FORBIDDEN",
          message: csrfCheck.reason || "Petición no permitida por política de origen.",
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

  const ipAddress = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: { code: "INVALID_BODY", message: "Cuerpo de solicitud inválido" } },
      { status: 400 }
    );
  }

  const parsed = createWarehouseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResponse<null>>(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Datos de bodega inválidos.",
          details: parsed.error.flatten().fieldErrors,
        },
      },
      { status: 400 }
    );
  }

  const normalizedCode = parsed.data.code.trim().toUpperCase();
  const normalizedName = parsed.data.name.trim();

  const db = getDb();
  if (!db) {
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: { code: "SERVICE_UNAVAILABLE", message: "Base de datos no disponible" } },
      { status: 503 }
    );
  }

  const existing = await db
    .select()
    .from(warehouses)
    .where(eq(warehouses.code, normalizedCode))
    .limit(1);

  if (existing.length > 0) {
    return NextResponse.json<ApiResponse<null>>(
      {
        success: false,
        error: {
          code: "WAREHOUSE_CODE_EXISTS",
          message: `Ya existe una bodega con el código '${normalizedCode}'.`,
        },
      },
      { status: 409 }
    );
  }

  const [newWarehouse] = await db
    .insert(warehouses)
    .values({
      code: normalizedCode,
      name: normalizedName,
      active: true,
    })
    .returning();

  await logAuditEvent({
    userId: currentUser.id,
    action: "USER_CREATED", // WAREHOUSE_CREATED
    entityType: "warehouses",
    entityId: newWarehouse.id,
    metadata: {
      actionType: "WAREHOUSE_CREATED",
      code: newWarehouse.code,
      name: newWarehouse.name,
      createdBy: currentUser.email,
    },
    ipAddress,
  });

  const sanitized: SanitizedWarehouse = {
    id: newWarehouse.id,
    code: newWarehouse.code,
    name: newWarehouse.name,
    active: newWarehouse.active,
    createdAt: newWarehouse.createdAt.toISOString(),
    updatedAt: newWarehouse.updatedAt.toISOString(),
  };

  return NextResponse.json<ApiResponse<{ warehouse: SanitizedWarehouse }>>(
    {
      success: true,
      data: { warehouse: sanitized },
    },
    { status: 201 }
  );
}
