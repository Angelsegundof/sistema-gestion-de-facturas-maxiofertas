import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users, rolesEnum } from "@/lib/db/schema";
import {
  hashPassword,
  logAuditEvent,
  requireRole,
  revokeAllUserSessions,
  validatePasswordPolicy,
  verifyCsrfOrigin,
  AuthError,
} from "@/lib/auth";
import { ApiResponse, SanitizedUser } from "@/types";

const updateUserSchema = z.object({
  name: z.string().min(2).max(150).optional(),
  role: z.enum(rolesEnum).optional(),
  active: z.boolean().optional(),
  warehouseId: z.string().uuid().nullable().optional(),
  password: z.string().optional(),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
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

  let currentUser: SanitizedUser;
  try {
    currentUser = await requireRole(["ADMIN"]);
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
      { success: false, error: { code: "INVALID_BODY", message: "Cuerpo de solicitud inválido" } },
      { status: 400 }
    );
  }

  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResponse<null>>(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Datos de actualización inválidos.",
          details: parsed.error.flatten().fieldErrors,
        },
      },
      { status: 400 }
    );
  }

  if (parsed.data.password) {
    const passCheck = validatePasswordPolicy(parsed.data.password);
    if (!passCheck.valid) {
      return NextResponse.json<ApiResponse<null>>(
        {
          success: false,
          error: {
            code: "WEAK_PASSWORD",
            message: passCheck.message || "La contraseña no cumple con las políticas de seguridad.",
          },
        },
        { status: 400 }
      );
    }
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: { code: "SERVICE_UNAVAILABLE", message: "Base de datos no disponible" } },
      { status: 503 }
    );
  }

  const targetList = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (targetList.length === 0) {
    return NextResponse.json<ApiResponse<null>>(
      {
        success: false,
        error: {
          code: "USER_NOT_FOUND",
          message: "El usuario especificado no existe.",
        },
      },
      { status: 404 }
    );
  }

  const targetUser = targetList[0];
  const updateData: Partial<typeof users.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (parsed.data.name !== undefined) {
    updateData.name = parsed.data.name.trim();
  }
  if (parsed.data.role !== undefined) {
    updateData.role = parsed.data.role;
  }
  if (parsed.data.active !== undefined) {
    updateData.active = parsed.data.active;
  }
  if (parsed.data.warehouseId !== undefined) {
    updateData.warehouseId = parsed.data.warehouseId;
  }
  if (parsed.data.password !== undefined) {
    updateData.passwordHash = await hashPassword(parsed.data.password);
  }

  const updatedList = await db
    .update(users)
    .set(updateData)
    .where(eq(users.id, id))
    .returning();

  const updatedUser = updatedList[0];

  // Si el usuario fue deshabilitado, cambió su rol o cambió su contraseña:
  // Revocar todas sus sesiones activas inmediatamente
  const shouldRevokeSessions =
    (parsed.data.active !== undefined && !parsed.data.active) ||
    (parsed.data.role !== undefined && parsed.data.role !== targetUser.role) ||
    parsed.data.password !== undefined;

  if (shouldRevokeSessions) {
    await revokeAllUserSessions(id);
  }

  // Registrar auditoría
  if (parsed.data.active !== undefined && parsed.data.active !== targetUser.active) {
    await logAuditEvent({
      userId: currentUser.id,
      action: parsed.data.active ? "USER_ENABLED" : "USER_DISABLED",
      entityType: "users",
      entityId: id,
      metadata: { targetEmail: targetUser.email, modifiedBy: currentUser.email },
      ipAddress,
    });
  }

  if (parsed.data.role !== undefined && parsed.data.role !== targetUser.role) {
    await logAuditEvent({
      userId: currentUser.id,
      action: "USER_ROLE_CHANGED",
      entityType: "users",
      entityId: id,
      metadata: {
        targetEmail: targetUser.email,
        oldRole: targetUser.role,
        newRole: parsed.data.role,
        modifiedBy: currentUser.email,
      },
      ipAddress,
    });
  }

  const sanitized: SanitizedUser = {
    id: updatedUser.id,
    email: updatedUser.email,
    name: updatedUser.name,
    role: updatedUser.role,
    warehouseId: updatedUser.warehouseId,
    active: updatedUser.active,
    createdAt: updatedUser.createdAt.toISOString(),
    updatedAt: updatedUser.updatedAt.toISOString(),
  };

  return NextResponse.json<ApiResponse<{ user: SanitizedUser }>>(
    {
      success: true,
      data: { user: sanitized },
    },
    { status: 200 }
  );
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
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

  let currentUser: SanitizedUser;
  try {
    currentUser = await requireRole(["ADMIN"]);
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

  if (id === currentUser.id) {
    return NextResponse.json<ApiResponse<null>>(
      {
        success: false,
        error: {
          code: "SELF_DELETION_FORBIDDEN",
          message: "No puedes eliminar tu propia cuenta de administrador activa.",
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

  const targetList = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (targetList.length === 0) {
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: { code: "USER_NOT_FOUND", message: "El usuario no existe." } },
      { status: 404 }
    );
  }

  const targetUser = targetList[0];

  await revokeAllUserSessions(id);

  try {
    // Attempt full delete; if constrained by foreign keys, soft delete (deactivate)
    await db.delete(users).where(eq(users.id, id));
  } catch {
    await db.update(users).set({ active: false, updatedAt: new Date() }).where(eq(users.id, id));
  }

  await logAuditEvent({
    userId: currentUser.id,
    action: "USER_DELETED",
    entityType: "users",
    entityId: id,
    metadata: { targetEmail: targetUser.email, deletedBy: currentUser.email },
    ipAddress,
  });

  return NextResponse.json<ApiResponse<{ message: string }>>(
    {
      success: true,
      data: { message: `Usuario ${targetUser.email} eliminado exitosamente.` },
    },
    { status: 200 }
  );
}
