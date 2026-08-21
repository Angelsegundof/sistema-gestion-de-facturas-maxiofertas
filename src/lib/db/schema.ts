import {
  pgTable,
  text,
  timestamp,
  varchar,
  boolean,
  jsonb,
  uuid,
  integer,
  bigint,
  numeric,
  unique,
  index,
  AnyPgColumn,
} from "drizzle-orm/pg-core";

export const rolesEnum = [
  "WAREHOUSE_USER",
  "INVOICE_EXECUTOR",
  "MANAGEMENT",
  "ADMIN",
] as const;

export type Role = (typeof rolesEnum)[number];

export const invoiceRequestStatuses = [
  "PENDING",
  "IN_PROGRESS",
  "NEEDS_CORRECTION",
  "COMPLETED",
  "CANCELLED",
  "DUPLICATE",
] as const;

export type InvoiceRequestStatus = (typeof invoiceRequestStatuses)[number];

export const reconciliationStatuses = [
  "MATCH",
  "ROUNDING_ACCEPTED",
  "MISMATCH",
] as const;

export type ReconciliationStatus = (typeof reconciliationStatuses)[number];

export const invoiceRequestSources = [
  "NATIVE",
  "GOOGLE_SHEETS_LEGACY",
] as const;

export type InvoiceRequestSource = (typeof invoiceRequestSources)[number];

export const requestCorrectionReasons = [
  "INVALID_RUT",
  "INVALID_LEGAL_NAME",
  "INVALID_BUSINESS_ACTIVITY",
  "WRONG_TOTAL",
  "INCOMPLETE_PRODUCTS",
  "WRONG_PRICE",
  "MISSING_INFORMATION",
  "TAX_DATA_INCONSISTENT",
  "DUPLICATE_REQUEST",
  "OTHER",
] as const;

export type RequestCorrectionReason = (typeof requestCorrectionReasons)[number];

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

export const documentTypesEnum = [
  "INVOICE",
  "CREDIT_NOTE",
  "XML_DTE",
  "OTHER",
] as const;

export type DocumentType = (typeof documentTypesEnum)[number];

export const storageProvidersEnum = ["R2", "GOOGLE_DRIVE"] as const;

export type StorageProvider = (typeof storageProvidersEnum)[number];

export const warehouses = pgTable("warehouses", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 150 }).notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const customers = pgTable("customers", {
  id: uuid("id").defaultRandom().primaryKey(),
  rutCanonical: varchar("rut_canonical", { length: 20 }).notNull().unique(),
  rutDisplay: varchar("rut_display", { length: 20 }).notNull(),
  legalName: varchar("legal_name", { length: 200 }).notNull(),
  businessActivity: varchar("business_activity", { length: 250 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  email: varchar("email", { length: 320 }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  name: varchar("name", { length: 150 }).notNull(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  role: varchar("role", { length: 50 }).notNull().$type<Role>(),
  warehouseId: uuid("warehouse_id").references(() => warehouses.id, { onDelete: "set null" }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: varchar("token", { length: 255 }).notNull().unique(),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  action: varchar("action", { length: 100 }).notNull(),
  entityType: varchar("entity_type", { length: 100 }).notNull(),
  entityId: varchar("entity_id", { length: 100 }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  ipAddress: varchar("ip_address", { length: 45 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const rateLimits = pgTable("rate_limits", {
  key: varchar("key", { length: 255 }).primaryKey(),
  count: integer("count").notNull().default(1),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }).defaultNow().notNull(),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
});

export const invoiceRequests = pgTable(
  "invoice_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    requestNumber: varchar("request_number", { length: 30 }).notNull().unique(),
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    requestedBy: uuid("requested_by")
      .notNull()
      .references(() => users.id),
    assignedTo: uuid("assigned_to").references(() => users.id),
    status: varchar("status", { length: 50 }).notNull().default("PENDING").$type<InvoiceRequestStatus>(),
    customerRutSnapshot: varchar("customer_rut_snapshot", { length: 20 }).notNull(),
    customerLegalNameSnapshot: varchar("customer_legal_name_snapshot", { length: 200 }).notNull(),
    customerBusinessActivitySnapshot: varchar("customer_business_activity_snapshot", { length: 250 }).notNull(),
    customerPhoneSnapshot: varchar("customer_phone_snapshot", { length: 50 }),
    customerEmailSnapshot: varchar("customer_email_snapshot", { length: 320 }),
    expectedGrossTotal: bigint("expected_gross_total", { mode: "number" }).notNull(),
    siiGrossTotal: bigint("sii_gross_total", { mode: "number" }),
    grossDifference: bigint("gross_difference", { mode: "number" }),
    reconciliationStatus: varchar("reconciliation_status", { length: 50 }).$type<ReconciliationStatus>(),
    notes: text("notes"),
    duplicateWarning: boolean("duplicate_warning").notNull().default(false),
    duplicateOverride: boolean("duplicate_override").notNull().default(false),
    duplicateOf: uuid("duplicate_of").references((): AnyPgColumn => invoiceRequests.id),
    source: varchar("source", { length: 50 }).notNull().default("NATIVE").$type<InvoiceRequestSource>(),
    legacySourceId: varchar("legacy_source_id", { length: 255 }),
    idempotencyKey: varchar("idempotency_key", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    assignedAt: timestamp("assigned_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("invoice_requests_user_idempotency_unique").on(table.requestedBy, table.idempotencyKey),
    index("invoice_requests_status_created_at_idx").on(table.status, table.createdAt),
    index("invoice_requests_assigned_to_idx").on(table.assignedTo),
    index("invoice_requests_legacy_source_id_idx").on(table.legacySourceId),
  ]
);

export const invoiceRequestItems = pgTable("invoice_request_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  invoiceRequestId: uuid("invoice_request_id")
    .notNull()
    .references(() => invoiceRequests.id, { onDelete: "cascade" }),
  lineNumber: integer("line_number").notNull(),
  description: varchar("description", { length: 500 }).notNull(),
  quantity: integer("quantity").notNull(),
  unitPriceGross: bigint("unit_price_gross", { mode: "number" }).notNull(),
  unitPriceNet: bigint("unit_price_net", { mode: "number" }).notNull(),
  lineTotalGross: bigint("line_total_gross", { mode: "number" }).notNull(),
  lineTotalNet: bigint("line_total_net", { mode: "number" }).notNull(),
  vatRate: numeric("vat_rate", { precision: 5, scale: 2 }).notNull().default("19.00"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const requestCorrections = pgTable("request_corrections", {
  id: uuid("id").defaultRandom().primaryKey(),
  invoiceRequestId: uuid("invoice_request_id")
    .notNull()
    .references(() => invoiceRequests.id, { onDelete: "cascade" }),
  reason: varchar("reason", { length: 100 }).notNull().$type<RequestCorrectionReason>(),
  comment: text("comment"),
  requestedBy: uuid("requested_by")
    .notNull()
    .references(() => users.id),
  resolvedBy: uuid("resolved_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentType: varchar("document_type", { length: 50 }).notNull().$type<DocumentType>(),
    storageProvider: varchar("storage_provider", { length: 50 }).notNull().default("R2").$type<StorageProvider>(),
    storageKey: text("storage_key").notNull(),
    externalUrl: text("external_url"),
    fileName: varchar("file_name", { length: 500 }).notNull(),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    fileSize: bigint("file_size", { mode: "number" }).notNull(),
    invoiceRequestId: uuid("invoice_request_id").references(() => invoiceRequests.id, { onDelete: "cascade" }),
    creditNoteId: uuid("credit_note_id"),
    isVoided: boolean("is_voided").notNull().default(false),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedByDocumentId: uuid("voided_by_document_id"),
    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("documents_invoice_request_id_idx").on(table.invoiceRequestId),
    index("documents_document_type_idx").on(table.documentType),
  ]
);

export const creditNotes = pgTable(
  "credit_notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    rectificationId: uuid("rectification_id").notNull(),
    invoiceRequestId: uuid("invoice_request_id")
      .notNull()
      .references(() => invoiceRequests.id, { onDelete: "cascade" }),
    originalDocumentId: uuid("original_document_id")
      .notNull()
      .references(() => documents.id),
    siiFolio: varchar("sii_folio", { length: 100 }),
    issuedAt: timestamp("issued_at", { withTimezone: true }).defaultNow().notNull(),
    grossTotal: bigint("gross_total", { mode: "number" }).notNull(),
    netTotal: bigint("net_total", { mode: "number" }),
    vatTotal: bigint("vat_total", { mode: "number" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("credit_notes_invoice_request_id_idx").on(table.invoiceRequestId),
    index("credit_notes_rectification_id_idx").on(table.rectificationId),
  ]
);

export const rectifications = pgTable(
  "rectifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    invoiceRequestId: uuid("invoice_request_id")
      .notNull()
      .references(() => invoiceRequests.id, { onDelete: "cascade" }),
    originalInvoiceDocumentId: uuid("original_invoice_document_id")
      .notNull()
      .references(() => documents.id),
    requestedBy: uuid("requested_by")
      .notNull()
      .references(() => users.id),
    assignedTo: uuid("assigned_to").references(() => users.id),
    reason: varchar("reason", { length: 100 }).notNull().$type<RectificationReason>(),
    comment: text("comment"),
    status: varchar("status", { length: 50 }).notNull().default("REQUESTED").$type<RectificationStatus>(),
    creditNoteId: uuid("credit_note_id").references((): AnyPgColumn => creditNotes.id),
    creditNoteDocumentId: uuid("credit_note_document_id").references((): AnyPgColumn => documents.id),
    replacementInvoiceDocumentId: uuid("replacement_invoice_document_id").references((): AnyPgColumn => documents.id),
    correctedCustomerSnapshot: jsonb("corrected_customer_snapshot"),
    correctedItemsSnapshot: jsonb("corrected_items_snapshot"),
    siiGrossTotal: bigint("sii_gross_total", { mode: "number" }),
    grossDifference: bigint("gross_difference", { mode: "number" }),
    reconciliationStatus: varchar("reconciliation_status", { length: 50 }).$type<ReconciliationStatus>(),
    requestedAt: timestamp("requested_at", { withTimezone: true }).defaultNow().notNull(),
    assignedAt: timestamp("assigned_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("rectifications_invoice_request_id_idx").on(table.invoiceRequestId),
    index("rectifications_status_requested_at_idx").on(table.status, table.requestedAt),
    index("rectifications_assigned_to_idx").on(table.assignedTo),
  ]
);

export const migrationRecords = pgTable(
  "migration_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    source: varchar("source", { length: 100 }).notNull(),
    sourceRowId: varchar("source_row_id", { length: 200 }),
    entityType: varchar("entity_type", { length: 100 }).notNull(),
    entityId: uuid("entity_id"),
    status: varchar("status", { length: 50 }).notNull().$type<"IMPORTED" | "SKIPPED" | "FAILED" | "MANUAL_REVIEW">(),
    errorMessage: text("error_message"),
    rawPayload: jsonb("raw_payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("migration_records_source_row_id_idx").on(table.source, table.sourceRowId),
    index("migration_records_status_idx").on(table.status),
  ]
);

export const documentShareTokens = pgTable(
  "document_share_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    invoiceRequestId: uuid("invoice_request_id")
      .notNull()
      .references(() => invoiceRequests.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 128 }).notNull().unique(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("document_share_tokens_token_hash_idx").on(table.tokenHash),
    index("document_share_tokens_document_id_idx").on(table.documentId),
    index("document_share_tokens_invoice_request_id_idx").on(table.invoiceRequestId),
  ]
);

export type Warehouse = typeof warehouses.$inferSelect;
export type NewWarehouse = typeof warehouses.$inferInsert;
export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
export type RateLimit = typeof rateLimits.$inferSelect;
export type NewRateLimit = typeof rateLimits.$inferInsert;
export type InvoiceRequest = typeof invoiceRequests.$inferSelect;
export type NewInvoiceRequest = typeof invoiceRequests.$inferInsert;
export type InvoiceRequestItem = typeof invoiceRequestItems.$inferSelect;
export type NewInvoiceRequestItem = typeof invoiceRequestItems.$inferInsert;
export type RequestCorrection = typeof requestCorrections.$inferSelect;
export type NewRequestCorrection = typeof requestCorrections.$inferInsert;
export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type CreditNote = typeof creditNotes.$inferSelect;
export type NewCreditNote = typeof creditNotes.$inferInsert;
export type Rectification = typeof rectifications.$inferSelect;
export type NewRectification = typeof rectifications.$inferInsert;
export type MigrationRecord = typeof migrationRecords.$inferSelect;
export type NewMigrationRecord = typeof migrationRecords.$inferInsert;
export type DocumentShareToken = typeof documentShareTokens.$inferSelect;
export type NewDocumentShareToken = typeof documentShareTokens.$inferInsert;

