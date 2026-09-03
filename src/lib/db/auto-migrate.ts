import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";
import { importRealUsersService } from "../../../scripts/import_real_users";

const ALL_MIGRATIONS = [
  // 0000
  `
  CREATE TABLE IF NOT EXISTS "users" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "email" varchar(320) NOT NULL UNIQUE,
    "name" varchar(150) NOT NULL,
    "password_hash" varchar(255) NOT NULL,
    "role" varchar(50) NOT NULL,
    "warehouse_id" uuid,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  --> statement-breakpoint
  CREATE TABLE IF NOT EXISTS "rate_limits" (
    "key" varchar(255) PRIMARY KEY NOT NULL,
    "count" integer DEFAULT 1 NOT NULL,
    "last_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
    "reset_at" timestamp with time zone NOT NULL
  );
  --> statement-breakpoint
  CREATE TABLE IF NOT EXISTS "sessions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid NOT NULL,
    "token" varchar(255) NOT NULL UNIQUE,
    "ip_address" varchar(45),
    "user_agent" text,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  --> statement-breakpoint
  CREATE TABLE IF NOT EXISTS "audit_logs" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid,
    "action" varchar(100) NOT NULL,
    "entity_type" varchar(100) NOT NULL,
    "entity_id" varchar(100),
    "metadata" jsonb,
    "ip_address" varchar(45),
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  `,
  // 0001
  `
  CREATE TABLE IF NOT EXISTS "customers" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "rut_canonical" varchar(20) NOT NULL UNIQUE,
    "rut_display" varchar(20) NOT NULL,
    "legal_name" varchar(200) NOT NULL,
    "business_activity" varchar(250) NOT NULL,
    "phone" varchar(50),
    "email" varchar(320),
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  --> statement-breakpoint
  CREATE TABLE IF NOT EXISTS "warehouses" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "code" varchar(50) NOT NULL UNIQUE,
    "name" varchar(150) NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  `,
  // 0002
  `
  CREATE SEQUENCE IF NOT EXISTS "invoice_request_seq" START WITH 1 INCREMENT BY 1;
  --> statement-breakpoint
  CREATE TABLE IF NOT EXISTS "invoice_requests" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "request_number" varchar(30) NOT NULL UNIQUE,
    "warehouse_id" uuid NOT NULL,
    "customer_id" uuid NOT NULL,
    "requested_by" uuid NOT NULL,
    "assigned_to" uuid,
    "status" varchar(50) DEFAULT 'PENDING' NOT NULL,
    "customer_rut_snapshot" varchar(20) NOT NULL,
    "customer_legal_name_snapshot" varchar(200) NOT NULL,
    "customer_business_activity_snapshot" varchar(250) NOT NULL,
    "customer_phone_snapshot" varchar(50),
    "customer_email_snapshot" varchar(320),
    "expected_gross_total" bigint NOT NULL,
    "sii_gross_total" bigint,
    "gross_difference" bigint,
    "reconciliation_status" varchar(50),
    "notes" text,
    "duplicate_warning" boolean DEFAULT false NOT NULL,
    "duplicate_override" boolean DEFAULT false NOT NULL,
    "duplicate_of" uuid,
    "source" varchar(50) DEFAULT 'NATIVE' NOT NULL,
    "idempotency_key" varchar(255),
    "legacy_source_id" varchar(255),
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "assigned_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  --> statement-breakpoint
  CREATE TABLE IF NOT EXISTS "invoice_request_items" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "invoice_request_id" uuid NOT NULL,
    "line_number" integer NOT NULL,
    "description" varchar(500) NOT NULL,
    "quantity" integer NOT NULL,
    "unit_price_gross" bigint NOT NULL,
    "unit_price_net" bigint NOT NULL,
    "line_total_gross" bigint NOT NULL,
    "line_total_net" bigint NOT NULL,
    "vat_rate" numeric(5, 2) DEFAULT '19.00' NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  `,
  // 0003 - 0007
  `
  CREATE TABLE IF NOT EXISTS "request_corrections" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "invoice_request_id" uuid NOT NULL,
    "reason" varchar(100) NOT NULL,
    "comment" text,
    "requested_by" uuid NOT NULL,
    "resolved_by" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "resolved_at" timestamp with time zone
  );
  --> statement-breakpoint
  CREATE TABLE IF NOT EXISTS "documents" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "document_type" varchar(50) NOT NULL,
    "storage_provider" varchar(50) DEFAULT 'R2' NOT NULL,
    "storage_key" text NOT NULL,
    "external_url" text,
    "file_name" varchar(500) NOT NULL,
    "mime_type" varchar(100) NOT NULL,
    "file_size" bigint NOT NULL,
    "invoice_request_id" uuid,
    "credit_note_id" uuid,
    "uploaded_by" uuid NOT NULL,
    "is_voided" boolean DEFAULT false NOT NULL,
    "voided_at" timestamp with time zone,
    "voided_by_document_id" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  --> statement-breakpoint
  CREATE TABLE IF NOT EXISTS "credit_notes" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "rectification_id" uuid NOT NULL,
    "invoice_request_id" uuid NOT NULL,
    "original_document_id" uuid NOT NULL,
    "sii_folio" varchar(100),
    "issued_at" timestamp with time zone DEFAULT now() NOT NULL,
    "gross_total" bigint NOT NULL,
    "net_total" bigint,
    "vat_total" bigint,
    "created_by" uuid NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  --> statement-breakpoint
  CREATE TABLE IF NOT EXISTS "rectifications" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "invoice_request_id" uuid NOT NULL,
    "original_invoice_document_id" uuid NOT NULL,
    "requested_by" uuid NOT NULL,
    "assigned_to" uuid,
    "reason" varchar(100) NOT NULL,
    "comment" text,
    "status" varchar(50) DEFAULT 'REQUESTED' NOT NULL,
    "credit_note_id" uuid,
    "credit_note_document_id" uuid,
    "replacement_invoice_document_id" uuid,
    "corrected_customer_snapshot" jsonb,
    "corrected_items_snapshot" jsonb,
    "sii_gross_total" bigint,
    "gross_difference" bigint,
    "reconciliation_status" varchar(50),
    "requested_at" timestamp with time zone DEFAULT now() NOT NULL,
    "assigned_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  --> statement-breakpoint
  CREATE TABLE IF NOT EXISTS "migration_records" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "source" varchar(100) NOT NULL,
    "source_row_id" varchar(200),
    "entity_type" varchar(100) NOT NULL,
    "entity_id" uuid,
    "status" varchar(50) NOT NULL,
    "error_message" text,
    "raw_payload" jsonb,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  `,
  // 0007
  `
  CREATE TABLE IF NOT EXISTS "document_share_tokens" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "document_id" uuid NOT NULL,
    "invoice_request_id" uuid NOT NULL,
    "token_hash" varchar(128) NOT NULL UNIQUE,
    "created_by" uuid NOT NULL,
    "expires_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  `,
  // 0008
  `
  ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "document_number" integer DEFAULT 1 NOT NULL;
  --> statement-breakpoint
  CREATE INDEX IF NOT EXISTS "idx_documents_request_docnum" ON "documents" ("invoice_request_id", "document_number");
  `,
];

let isInitialized = false;

export async function ensureNeonSchema(dbUrl: string): Promise<void> {
  if (isInitialized) return;

  try {
    const sqlClient = neon(dbUrl);
    const db = drizzle(sqlClient, { schema });

    // Check if users table exists
    const res: any = await sqlClient`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      ) as exists;
    `;

    const tableExists = res && res[0] && res[0].exists === true;

    if (!tableExists) {
      console.log("[NEON AUTO-INIT] Tablas no encontradas en Neon. Creando esquema...");
      for (const migrationChunk of ALL_MIGRATIONS) {
        const statements = migrationChunk
          .split("--> statement-breakpoint")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);

        for (const stmt of statements) {
          try {
            await sqlClient(stmt);
          } catch (e: any) {
            // Safe ignore if constraint or sequence already exists
            if (!e.message?.includes("already exists")) {
              console.warn("[MIGRATION WARNING]:", e.message);
            }
          }
        }
      }

      console.log("[NEON AUTO-INIT] Esquema creado. Provisionando 20 usuarios y 16 bodegas...");
      await importRealUsersService(db);
      console.log("[NEON AUTO-INIT] Inicialización completa.");
    }

    isInitialized = true;
  } catch (err) {
    console.error("[NEON AUTO-INIT ERROR]:", err);
  }
}
