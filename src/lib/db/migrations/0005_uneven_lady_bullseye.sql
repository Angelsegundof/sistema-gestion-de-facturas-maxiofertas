CREATE TABLE "credit_notes" (
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
CREATE TABLE "rectifications" (
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
ALTER TABLE "documents" ADD COLUMN "is_voided" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "voided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "voided_by_document_id" uuid;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_invoice_request_id_invoice_requests_id_fk" FOREIGN KEY ("invoice_request_id") REFERENCES "public"."invoice_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_original_document_id_documents_id_fk" FOREIGN KEY ("original_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rectifications" ADD CONSTRAINT "rectifications_invoice_request_id_invoice_requests_id_fk" FOREIGN KEY ("invoice_request_id") REFERENCES "public"."invoice_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rectifications" ADD CONSTRAINT "rectifications_original_invoice_document_id_documents_id_fk" FOREIGN KEY ("original_invoice_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rectifications" ADD CONSTRAINT "rectifications_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rectifications" ADD CONSTRAINT "rectifications_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rectifications" ADD CONSTRAINT "rectifications_credit_note_id_credit_notes_id_fk" FOREIGN KEY ("credit_note_id") REFERENCES "public"."credit_notes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rectifications" ADD CONSTRAINT "rectifications_credit_note_document_id_documents_id_fk" FOREIGN KEY ("credit_note_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rectifications" ADD CONSTRAINT "rectifications_replacement_invoice_document_id_documents_id_fk" FOREIGN KEY ("replacement_invoice_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_notes_invoice_request_id_idx" ON "credit_notes" USING btree ("invoice_request_id");--> statement-breakpoint
CREATE INDEX "credit_notes_rectification_id_idx" ON "credit_notes" USING btree ("rectification_id");--> statement-breakpoint
CREATE INDEX "rectifications_invoice_request_id_idx" ON "rectifications" USING btree ("invoice_request_id");--> statement-breakpoint
CREATE INDEX "rectifications_status_requested_at_idx" ON "rectifications" USING btree ("status","requested_at");--> statement-breakpoint
CREATE INDEX "rectifications_assigned_to_idx" ON "rectifications" USING btree ("assigned_to");