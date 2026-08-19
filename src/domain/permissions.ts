import { Permission, Role } from "./types";

/**
 * Matriz oficial de Roles y Permisos (v1.0)
 * Implementaci?n con pol?tica DEFAULT DENY.
 */
const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  WAREHOUSE_USER: [
    "AUTH_LOGIN",
    "PROFILE_VIEW",
    "REQUEST_CREATE",
    "REQUEST_VIEW_OWN",
    "REQUEST_CORRECT_PRE_INVOICE",
    "REQUEST_CANCEL",
    "INVOICE_VIEW",
    "RECTIFICATION_REQUEST",
  ],
  INVOICE_EXECUTOR: [
    "AUTH_LOGIN",
    "PROFILE_VIEW",
    "REQUEST_VIEW_ALL",
    "REQUEST_CLAIM",
    "REQUEST_REQUEST_CORRECTION",
    "REQUEST_MARK_DUPLICATE",
    "INVOICE_ENTER_SII_TOTAL",
    "INVOICE_UPLOAD_PDF",
    "INVOICE_FINALIZE",
    "INVOICE_VIEW",
    "RECTIFICATION_CLAIM",
    "CREDIT_NOTE_REGISTER",
    "CREDIT_NOTE_UPLOAD",
    "INVOICE_CORRECTED_GENERATE",
    "RECTIFICATION_FINALIZE",
    "STATS_VIEW",
  ],
  MANAGEMENT: [
    "AUTH_LOGIN",
    "PROFILE_VIEW",
    "REQUEST_VIEW_ALL",
    "INVOICE_VIEW",
    "STATS_VIEW",
    "AUDIT_VIEW",
  ],
  ADMIN: [
    "AUTH_LOGIN",
    "PROFILE_VIEW",
    "REQUEST_CREATE",
    "REQUEST_VIEW_OWN",
    "REQUEST_VIEW_ALL",
    "REQUEST_CLAIM",
    "REQUEST_REASSIGN",
    "REQUEST_CORRECT_PRE_INVOICE",
    "REQUEST_REQUEST_CORRECTION",
    "REQUEST_CANCEL",
    "REQUEST_MARK_DUPLICATE",
    "INVOICE_ENTER_SII_TOTAL",
    "INVOICE_UPLOAD_PDF",
    "INVOICE_FINALIZE",
    "INVOICE_VIEW",
    "RECTIFICATION_REQUEST",
    "RECTIFICATION_CLAIM",
    "CREDIT_NOTE_REGISTER",
    "CREDIT_NOTE_UPLOAD",
    "INVOICE_CORRECTED_GENERATE",
    "RECTIFICATION_FINALIZE",
    "STATS_VIEW",
    "AUDIT_VIEW",
    "USER_MANAGE",
    "WAREHOUSE_MANAGE",
    "USER_STATUS_CHANGE",
  ],
} as const;

export function hasPermission(role: Role, permission: Permission): boolean {
  const permissions = ROLE_PERMISSIONS[role];
  if (!permissions) {
    return false; // Default Deny
  }
  return permissions.includes(permission);
}

export function getRolePermissions(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role] || [];
}
