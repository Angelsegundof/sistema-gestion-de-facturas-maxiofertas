CREATE TABLE IF NOT EXISTS "document_share_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL REFERENCES "documents"("id") ON DELETE cascade,
	"invoice_request_id" uuid NOT NULL REFERENCES "invoice_requests"("id") ON DELETE cascade,
	"token_hash" varchar(128) NOT NULL UNIQUE,
	"created_by" uuid NOT NULL REFERENCES "users"("id"),
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_share_tokens_token_hash_idx" ON "document_share_tokens" ("token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_share_tokens_document_id_idx" ON "document_share_tokens" ("document_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_share_tokens_invoice_request_id_idx" ON "document_share_tokens" ("invoice_request_id");
