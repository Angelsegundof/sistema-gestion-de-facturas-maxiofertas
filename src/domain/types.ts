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
  | "USER_STATUS_CHANGE"
  | "WAREHOUSE_VIEW"
  | "CUSTOMER_VIEW"
  | "CUSTOMER_CREATE"
  | "CUSTOMER_MANAGE";

export interface SanitizedWarehouse {
  id: string;
  code: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SanitizedCustomer {
  id: string;
  rut: string; // Formato display (ej: 76.123.456-7)
  rutCanonical: string; // Formato can?nico (ej: 761234567)
  legalName: string;
  businessActivity: string;
  phone: string | null;
  email: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SanitizedUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  warehouseId: string | null;
  warehouse?: SanitizedWarehouse | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}
