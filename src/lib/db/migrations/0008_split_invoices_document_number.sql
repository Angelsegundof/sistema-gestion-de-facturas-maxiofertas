ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "document_number" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_invoice_request_doc_num_idx" ON "documents" ("invoice_request_id", "document_number");
