import { Permission, Role, SanitizedUser } from "@/domain/types";
import { hasPermission } from "@/domain/permissions";
import { getServerSession } from "./session";

export class AuthError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 401
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export class UnauthorizedError extends AuthError {
  constructor(message = "Debes iniciar sesi?n para acceder a este recurso") {
    super("UNAUTHORIZED", message, 401);
  }
}

export class ForbiddenError extends AuthError {
  constructor(message = "No tienes permisos suficientes para realizar esta acci?n") {
    super("FORBIDDEN", message, 403);
  }
}

export async function requireAuth(): Promise<SanitizedUser> {
  const sessionResult = await getServerSession();
  if (!sessionResult || !sessionResult.user.active) {
    throw new UnauthorizedError();
  }
  return sessionResult.user;
}

export async function requireRole(allowedRoles: readonly Role[]): Promise<SanitizedUser> {
  const user = await requireAuth();
  if (!allowedRoles.includes(user.role)) {
    throw new ForbiddenError();
  }
  return user;
}

export async function requirePermission(permission: Permission): Promise<SanitizedUser> {
  const user = await requireAuth();
  if (!hasPermission(user.role, permission)) {
    throw new ForbiddenError();
  }
  return user;
}
