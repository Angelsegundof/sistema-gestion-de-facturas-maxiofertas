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
DO $$ BEGIN
	IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_requests_idempotency_key_unique') THEN
		ALTER TABLE "invoice_requests" DROP CONSTRAINT "invoice_requests_idempotency_key_unique";
	END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'request_corrections_invoice_request_id_invoice_requests_id_fk') THEN
		ALTER TABLE "request_corrections" ADD CONSTRAINT "request_corrections_invoice_request_id_invoice_requests_id_fk" FOREIGN KEY ("invoice_request_id") REFERENCES "public"."invoice_requests"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'request_corrections_requested_by_users_id_fk') THEN
		ALTER TABLE "request_corrections" ADD CONSTRAINT "request_corrections_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'request_corrections_resolved_by_users_id_fk') THEN
		ALTER TABLE "request_corrections" ADD CONSTRAINT "request_corrections_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_requests_status_created_at_idx" ON "invoice_requests" USING btree ("status","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_requests_assigned_to_idx" ON "invoice_requests" USING btree ("assigned_to");
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_requests_user_idempotency_unique') THEN
		ALTER TABLE "invoice_requests" ADD CONSTRAINT "invoice_requests_user_idempotency_unique" UNIQUE("requested_by","idempotency_key");
	END IF;
END $$;
