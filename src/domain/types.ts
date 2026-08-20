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

export type InvoiceRequestStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "NEEDS_CORRECTION"
  | "COMPLETED"
  | "CANCELLED"
  | "DUPLICATE";

export type ReconciliationStatus = "MATCH" | "ROUNDING_ACCEPTED" | "MISMATCH";

export type InvoiceRequestSource = "NATIVE" | "GOOGLE_SHEETS_LEGACY";

export type RequestCorrectionReason =
  | "INVALID_RUT"
  | "INVALID_LEGAL_NAME"
  | "INVALID_BUSINESS_ACTIVITY"
  | "WRONG_TOTAL"
  | "INCOMPLETE_PRODUCTS"
  | "WRONG_PRICE"
  | "MISSING_INFORMATION"
  | "TAX_DATA_INCONSISTENT"
  | "DUPLICATE_REQUEST"
  | "OTHER";

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

export interface SanitizedInvoiceRequestItem {
  id: string;
  invoiceRequestId: string;
  lineNumber: number;
  description: string;
  quantity: number;
  unitPriceGross: number;
  unitPriceNet: number;
  lineTotalGross: number;
  lineTotalNet: number;
  vatRate: string;
  createdAt: string;
  updatedAt: string;
}

export interface SanitizedRequestCorrection {
  id: string;
  invoiceRequestId: string;
  reason: RequestCorrectionReason;
  comment: string | null;
  requestedBy: string;
  requestedByName?: string;
  resolvedBy: string | null;
  resolvedByName?: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export type AgeCategory = "under_30m" | "30_60m" | "1_2h" | "over_2h";

export interface AgeIndicator {
  minutesElapsed: number;
  displayAge: string;
  category: AgeCategory;
}

export interface SanitizedInvoiceRequest {
  id: string;
  requestNumber: string;
  warehouseId: string;
  warehouse?: SanitizedWarehouse | null;
  customerId: string;
  customer?: SanitizedCustomer | null;
  requestedBy: string;
  requesterName?: string;
  assignedTo: string | null;
  assignedName?: string | null;
  status: InvoiceRequestStatus;
  customerRutSnapshot: string;
  customerLegalNameSnapshot: string;
  customerBusinessActivitySnapshot: string;
  customerPhoneSnapshot: string | null;
  customerEmailSnapshot: string | null;
  expectedGrossTotal: number;
  siiGrossTotal: number | null;
  grossDifference: number | null;
  reconciliationStatus: ReconciliationStatus | null;
  notes: string | null;
  duplicateWarning: boolean;
  duplicateOverride: boolean;
  duplicateOf: string | null;
  source: InvoiceRequestSource;
  idempotencyKey?: string | null;
  createdAt: string;
  assignedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
  age?: AgeIndicator;
  items?: SanitizedInvoiceRequestItem[];
  corrections?: SanitizedRequestCorrection[];
}

export interface DuplicateCandidate {
  id: string;
  requestNumber: string;
  createdAt: string;
  grossTotal: number;
  status: InvoiceRequestStatus;
  customerLegalName: string;
  customerRut: string;
}

export interface QueueSummaryCounters {
  pendingCount: number;
  inProgressCount: number;
  needsCorrectionCount: number;
  changesRequestedCount: number;
  completedTodayCount: number;
}
