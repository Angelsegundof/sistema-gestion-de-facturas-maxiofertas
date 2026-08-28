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
  | "DUPLICATE_OVERRIDE"
  | "REQUEST_ASSIGNED"
  | "REQUEST_CORRECTION_REQUESTED"
  | "REQUEST_RESUBMITTED"
  | "REQUEST_REASSIGNED"
  | "REQUEST_RECONCILED"
  | "INVOICE_UPLOADED"
  | "INVOICE_REPLACED"
  | "INVOICE_COMPLETED"
  | "DOCUMENT_ACCESSED"
  | "RECTIFICATION_REQUESTED"
  | "RECTIFICATION_ASSIGNED"
  | "CREDIT_NOTE_REGISTERED"
  | "REPLACEMENT_INVOICE_UPLOADED"
  | "RECTIFICATION_COMPLETED"
  | "DOCUMENT_SHARE_TOKEN_CREATED"
  | "USERS_IMPORT_STARTED"
  | "USERS_IMPORT_COMPLETED"
  | "USERS_IMPORT_FAILED"
  | "HISTORICAL_IMPORT_STARTED"
  | "HISTORICAL_IMPORT_COMPLETED"
  | "HISTORICAL_IMPORT_FAILED";

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
