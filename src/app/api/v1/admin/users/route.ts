import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users, rolesEnum } from "@/lib/db/schema";
import {
  hashPassword,
  logAuditEvent,
  requireRole,
  validatePasswordPolicy,
  verifyCsrfOrigin,
  AuthError,
} from "@/lib/auth";
import { ApiResponse, SanitizedUser } from "@/types";

const createUserSchema = z.object({
  email: z.string().email("Formato de correo inválido"),
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres").max(150),
  password: z.string().min(1, "La contraseña es requerida"),
  role: z.enum(rolesEnum),
  warehouseId: z.string().uuid().nullable().optional(),
});

export async function GET(request: NextRequest) {
  try {
    await requireRole(["ADMIN"]);
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

  const db = getDb();
  if (!db) {
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: { code: "SERVICE_UNAVAILABLE", message: "Base de datos no disponible" } },
      { status: 503 }
    );
  }

  const userList = await db.select().from(users).orderBy(desc(users.createdAt));
  const sanitizedList: SanitizedUser[] = userList.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    warehouseId: u.warehouseId,
    active: u.active,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  }));

  return NextResponse.json<ApiResponse<{ users: SanitizedUser[] }>>(
    {
      success: true,
      data: { users: sanitizedList },
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

  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResponse<null>>(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Datos de usuario inválidos.",
          details: parsed.error.flatten().fieldErrors,
        },
      },
      { status: 400 }
    );
  }

  // 2. Validación de política de contraseñas
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

  const normalizedEmail = parsed.data.email.trim().toLowerCase();
  const db = getDb();
  if (!db) {
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: { code: "SERVICE_UNAVAILABLE", message: "Base de datos no disponible" } },
      { status: 503 }
    );
  }

  // Check email collision
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (existing.length > 0) {
    return NextResponse.json<ApiResponse<null>>(
      {
        success: false,
        error: {
          code: "EMAIL_ALREADY_EXISTS",
          message: "Ya existe un usuario registrado con este correo electrónico.",
        },
      },
      { status: 409 }
    );
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const insertedList = await db
    .insert(users)
    .values({
      email: normalizedEmail,
      name: parsed.data.name.trim(),
      passwordHash,
      role: parsed.data.role,
      warehouseId: parsed.data.warehouseId || null,
      active: true,
    })
    .returning();

  const newUser = insertedList[0];

  await logAuditEvent({
    userId: currentUser.id,
    action: "USER_CREATED",
    entityType: "users",
    entityId: newUser.id,
    metadata: {
      email: newUser.email,
      role: newUser.role,
      createdBy: currentUser.email,
    },
    ipAddress,
  });

  const sanitized: SanitizedUser = {
    id: newUser.id,
    email: newUser.email,
    name: newUser.name,
    role: newUser.role,
    warehouseId: newUser.warehouseId,
    active: newUser.active,
    createdAt: newUser.createdAt.toISOString(),
    updatedAt: newUser.updatedAt.toISOString(),
  };

  return NextResponse.json<ApiResponse<{ user: SanitizedUser }>>(
    {
      success: true,
      data: { user: sanitized },
    },
    { status: 201 }
  );
}
