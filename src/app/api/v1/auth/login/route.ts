import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, ensureDbReady } from "@/lib/db";
import { users } from "@/lib/db/schema";
import {
  authRateLimiter,
  createSession,
  getSessionCookieOptions,
  logAuditEvent,
  verifyCsrfOrigin,
  verifyPassword,
} from "@/lib/auth";
import { ApiResponse, SanitizedUser } from "@/types";

const loginSchema = z.object({
  email: z.string().email("Formato de correo inválido"),
  password: z.string().min(1, "La contraseña es requerida"),
});

export async function POST(request: NextRequest) {
  await ensureDbReady();
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

  const ipAddress = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
  const userAgent = request.headers.get("user-agent") || "unknown";

  // 2. Validar Rate Limit distribuido por IP
  const rateCheck = await authRateLimiter.isRateLimited(`ip:${ipAddress}`);
  if (rateCheck.limited) {
    const retrySeconds = Math.ceil(rateCheck.retryAfterMs / 1000);
    return NextResponse.json<ApiResponse<null>>(
      {
        success: false,
        error: {
          code: "TOO_MANY_REQUESTS",
          message: `Demasiados intentos de acceso fallidos. Por favor, reintenta en ${retrySeconds} segundos.`,
        },
      },
      { status: 429 }
    );
  }

  // 3. Parsear body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json<ApiResponse<null>>(
      {
        success: false,
        error: {
          code: "INVALID_BODY",
          message: "Formato de solicitud no válido.",
        },
      },
      { status: 400 }
    );
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResponse<null>>(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Datos de inicio de sesión incompletos o inválidos.",
        },
      },
      { status: 400 }
    );
  }

  const normalizedEmail = parsed.data.email.trim().toLowerCase();
  await ensureDbReady();
  const db = getDb();
  if (!db) {
    return NextResponse.json<ApiResponse<null>>(
      {
        success: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Servicio de autenticación no disponible.",
        },
      },
      { status: 503 }
    );
  }

  // 4. Buscar usuario
  const userList = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  const genericAuthError = {
    code: "INVALID_CREDENTIALS",
    message: "Credenciales de acceso inválidas o usuario no autorizado.",
  };

  if (userList.length === 0) {
    await authRateLimiter.recordAttempt(`ip:${ipAddress}`);
    await logAuditEvent({
      action: "LOGIN_FAILED",
      entityType: "users",
      metadata: { email: normalizedEmail, reason: "USER_NOT_FOUND" },
      ipAddress,
    });
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: genericAuthError },
      { status: 401 }
    );
  }

  const user = userList[0];

  // 5. Verificar si el usuario está activo
  if (!user.active) {
    await authRateLimiter.recordAttempt(`ip:${ipAddress}`);
    await logAuditEvent({
      userId: user.id,
      action: "LOGIN_FAILED",
      entityType: "users",
      entityId: user.id,
      metadata: { email: normalizedEmail, reason: "USER_INACTIVE" },
      ipAddress,
    });
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: genericAuthError },
      { status: 401 }
    );
  }

  // 6. Verificar contraseña
  const isPasswordValid = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!isPasswordValid) {
    await authRateLimiter.recordAttempt(`ip:${ipAddress}`);
    await logAuditEvent({
      userId: user.id,
      action: "LOGIN_FAILED",
      entityType: "users",
      entityId: user.id,
      metadata: { email: normalizedEmail, reason: "PASSWORD_MISMATCH" },
      ipAddress,
    });
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: genericAuthError },
      { status: 401 }
    );
  }

  // 7. Resetear rate limiter al tener éxito
  await authRateLimiter.reset(`ip:${ipAddress}`);

  // 8. Crear sesión
  const sessionToken = await createSession(user.id, ipAddress, userAgent);

  await logAuditEvent({
    userId: user.id,
    action: "LOGIN_SUCCESS",
    entityType: "users",
    entityId: user.id,
    metadata: { email: normalizedEmail, role: user.role },
    ipAddress,
  });

  const sanitizedUser: SanitizedUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    warehouseId: user.warehouseId,
    active: user.active,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };

  const response = NextResponse.json<ApiResponse<{ user: SanitizedUser }>>(
    {
      success: true,
      data: {
        user: sanitizedUser,
      },
    },
    { status: 200 }
  );

  const cookieOptions = getSessionCookieOptions(sessionToken);
  response.cookies.set({
    name: cookieOptions.name,
    value: cookieOptions.value,
    httpOnly: cookieOptions.httpOnly,
    secure: cookieOptions.secure,
    sameSite: cookieOptions.sameSite,
    path: cookieOptions.path,
    maxAge: cookieOptions.maxAge,
  });

  return response;
}
