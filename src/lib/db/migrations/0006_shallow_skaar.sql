CREATE TABLE "migration_records" (
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
--> statement-breakpoint
ALTER TABLE "invoice_requests" ADD COLUMN "legacy_source_id" varchar(255);--> statement-breakpoint
CREATE INDEX "migration_records_source_row_id_idx" ON "migration_records" USING btree ("source","source_row_id");--> statement-breakpoint
CREATE INDEX "migration_records_status_idx" ON "migration_records" USING btree ("status");--> statement-breakpoint
CREATE INDEX "invoice_requests_legacy_source_id_idx" ON "invoice_requests" USING btree ("legacy_source_id");