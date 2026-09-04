ALTER TABLE "invoice_requests" ADD COLUMN IF NOT EXISTS "customer_delivery_status" varchar(20) DEFAULT 'PENDING';
--> statement-breakpoint
ALTER TABLE "invoice_requests" ADD COLUMN IF NOT EXISTS "customer_sent_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "invoice_requests" ADD COLUMN IF NOT EXISTS "customer_sent_by" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_requests_customer_delivery_status_idx" ON "invoice_requests" ("customer_delivery_status");
--> statement-breakpoint
UPDATE "invoice_requests"
SET "customer_delivery_status" = 'LEGACY'
WHERE "source" = 'GOOGLE_SHEETS_LEGACY' OR "legacy_source_id" IS NOT NULL;
