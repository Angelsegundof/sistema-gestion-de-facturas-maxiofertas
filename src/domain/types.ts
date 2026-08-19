export type Role = "WAREHOUSE_USER" | "INVOICE_EXECUTOR" | "MANAGEMENT" | "ADMIN";

export type Permission =
  | "AUTH_LOGIN"
  | "PROFILE_VIEW"
  | "REQUEST_CREATE"
  | "REQUEST_VIEW_OWN"
  | "REQUEST_VIEW_ALL"
  | "REQUEST_CLAIM"
  | "REQUEST_REASSIGN"
  | "REQUEST_CORRECT_PRE_INVOICE"
  | "REQUEST_REQUEST_CORRECTION"
  | "REQUEST_CANCEL"
  | "REQUEST_MARK_DUPLICATE"
  | "INVOICE_ENTER_SII_TOTAL"
  | "INVOICE_UPLOAD_PDF"
  | "INVOICE_FINALIZE"
  | "INVOICE_VIEW"
  | "RECTIFICATION_REQUEST"
  | "RECTIFICATION_CLAIM"
  | "CREDIT_NOTE_REGISTER"
  | "CREDIT_NOTE_UPLOAD"
  | "INVOICE_CORRECTED_GENERATE"
  | "RECTIFICATION_FINALIZE"
  | "STATS_VIEW"
  | "AUDIT_VIEW"
  | "USER_MANAGE"
  | "WAREHOUSE_MANAGE"
  | "USER_STATUS_CHANGE";

export interface SanitizedUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  warehouseId: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}
