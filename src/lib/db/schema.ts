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
    idempotencyKey: varchar("idempotency_key", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    assignedAt: timestamp("assigned_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("invoice_requests_user_idempotency_unique").on(table.requestedBy, table.idempotencyKey),
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
