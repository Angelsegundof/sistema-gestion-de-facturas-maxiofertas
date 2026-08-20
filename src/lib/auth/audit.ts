import { getDb } from "../db";
import { auditLogs, NewAuditLog } from "../db/schema";

export type AuditAction =
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILED"
  | "LOGOUT"
  | "SESSION_REVOKED"
  | "USER_CREATED"
  | "USER_ROLE_CHANGED"
  | "USER_DISABLED"
  | "USER_ENABLED"
  | "WAREHOUSE_CREATED"
  | "WAREHOUSE_UPDATED"
  | "WAREHOUSE_DISABLED"
  | "WAREHOUSE_ENABLED"
  | "CUSTOMER_CREATED"
  | "CUSTOMER_UPDATED"
  | "REQUEST_CREATED"
  | "DUPLICATE_WARNING_SHOWN"
  | "DUPLICATE_OVERRIDE";

export interface LogAuditParams {
  userId?: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}

export async function logAuditEvent(params: LogAuditParams): Promise<void> {
  const db = getDb();
  if (!db) {
    return;
  }

  try {
    const entry: NewAuditLog = {
      userId: params.userId || null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId || null,
      metadata: params.metadata || null,
      ipAddress: params.ipAddress || null,
    };
    await db.insert(auditLogs).values(entry);
  } catch (error) {
    // Non-blocking log error: never crash the core operation on audit insert failure
    console.error("Failed to persist audit log:", error);
  }
}
