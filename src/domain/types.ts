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

export const documentTypesEnum = [
  "INVOICE",
  "CREDIT_NOTE",
  "XML_DTE",
  "OTHER",
] as const;

export type DocumentType = (typeof documentTypesEnum)[number];

export const storageProvidersEnum = ["R2", "GOOGLE_DRIVE"] as const;

export type StorageProvider = (typeof storageProvidersEnum)[number];

export const rectificationStatuses = [
  "REQUESTED",
  "IN_PROGRESS",
  "CREDIT_NOTE_REGISTERED",
  "NEW_INVOICE_PENDING",
  "COMPLETED",
  "CANCELLED",
] as const;

export type RectificationStatus = (typeof rectificationStatuses)[number];

export const rectificationReasons = [
  "RUT",
  "LEGAL_NAME",
  "BUSINESS_ACTIVITY",
  "PRODUCT",
  "QUANTITY",
  "PRICE",
  "TOTAL",
  "OTHER",
] as const;

export type RectificationReason = (typeof rectificationReasons)[number];

export interface SanitizedDocument {
  id: string;
  documentType: DocumentType;
  storageProvider: StorageProvider;
  storageKey: string;
  externalUrl?: string | null;
  fileName: string;
  mimeType: string;
  fileSize: number;
  invoiceRequestId: string | null;
  creditNoteId?: string | null;
  isVoided?: boolean;
  voidedAt?: string | null;
  voidedByDocumentId?: string | null;
  uploadedBy: string;
  uploadedByName?: string;
  createdAt: string;
  accessUrl?: string;
}

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
  document?: SanitizedDocument | null;
  rectifications?: SanitizedRectification[];
  activeRectification?: SanitizedRectification | null;
}

export interface SanitizedCreditNote {
  id: string;
  rectificationId: string;
  invoiceRequestId: string;
  originalDocumentId: string;
  siiFolio?: string | null;
  issuedAt: string;
  grossTotal: number;
  netTotal?: number | null;
  vatTotal?: number | null;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
  document?: SanitizedDocument | null;
}

export interface SanitizedRectification {
  id: string;
  invoiceRequestId: string;
  requestNumber?: string;
  originalInvoiceDocumentId: string;
  requestedBy: string;
  requesterName?: string;
  assignedTo: string | null;
  assignedName?: string | null;
  reason: RectificationReason;
  comment: string | null;
  status: RectificationStatus;
  creditNoteId?: string | null;
  creditNoteDocumentId?: string | null;
  replacementInvoiceDocumentId?: string | null;
  correctedCustomerSnapshot?: Record<string, unknown> | null;
  correctedItemsSnapshot?: unknown[] | null;
  siiGrossTotal?: number | null;
  grossDifference?: number | null;
  reconciliationStatus?: ReconciliationStatus | null;
  requestedAt: string;
  assignedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  age?: AgeIndicator;
  creditNote?: SanitizedCreditNote | null;
  creditNoteDocument?: SanitizedDocument | null;
  originalInvoiceDocument?: SanitizedDocument | null;
  replacementInvoiceDocument?: SanitizedDocument | null;
  invoiceRequest?: SanitizedInvoiceRequest | null;
}

export interface InvoiceTimelineEvent {
  id: string;
  type:
    | "REQUEST_CREATED"
    | "INVOICE_COMPLETED"
    | "RECTIFICATION_REQUESTED"
    | "CREDIT_NOTE_REGISTERED"
    | "RECTIFICATION_COMPLETED";
  title: string;
  description?: string;
  timestamp: string;
  performedBy?: string;
  documentId?: string;
  documentFileName?: string;
  documentAccessUrl?: string;
  metadata?: Record<string, unknown>;
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

export interface StatisticsPeriod {
  month: number;
  year: number;
  label: string;
  startDate: string;
  endDate: string;
}

export interface OperationalStatistics {
  totalRequests: number;
  pending: number;
  inProgress: number;
  needsCorrection: number;
  completed: number;
  cancelled: number;
  changesRequested: number;
  changesCompleted: number;
  averageResolutionMinutes: number;
}

export interface StatisticsSummary {
  period: StatisticsPeriod;
  grossIssued: number;
  creditNotesTotal: number;
  creditNotesCount: number;
  grossTotal: number; // Facturación vigente
  netEstimated: number;
  vatEstimated: number;
  invoiceCount: number; // Cantidad de facturas vigentes
  averageTicket: number;
  operational: OperationalStatistics;
}

export interface WarehouseStatistics {
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  grossTotal: number;
  netEstimated: number;
  vatEstimated: number;
  invoiceCount: number;
  averageTicket: number;
  percentage: number;
}

export interface MonthlyEvolutionItem {
  period: string; // YYYY-MM
  label: string; // E.g. Ago 2026
  year: number;
  month: number;
  grossTotal: number;
  netEstimated: number;
  vatEstimated: number;
  creditNotesTotal: number;
  invoiceCount: number;
}

export interface SanitizedDocumentShareToken {
  id: string;
  documentId: string;
  invoiceRequestId: string;
  shareUrl: string;
  expiresAt: string | null;
  createdAt: string;
}

