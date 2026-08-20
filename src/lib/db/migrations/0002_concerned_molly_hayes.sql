CREATE SEQUENCE IF NOT EXISTS "invoice_request_seq" START WITH 1 INCREMENT BY 1;
--> statement-breakpoint
CREATE TABLE "invoice_request_items" (
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
--> statement-breakpoint
CREATE TABLE "invoice_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_number" varchar(30) NOT NULL,
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
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assigned_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_requests_request_number_unique" UNIQUE("request_number"),
	CONSTRAINT "invoice_requests_user_idempotency_unique" UNIQUE("requested_by", "idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "invoice_request_items" ADD CONSTRAINT "invoice_request_items_invoice_request_id_invoice_requests_id_fk" FOREIGN KEY ("invoice_request_id") REFERENCES "public"."invoice_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_requests" ADD CONSTRAINT "invoice_requests_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_requests" ADD CONSTRAINT "invoice_requests_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_requests" ADD CONSTRAINT "invoice_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_requests" ADD CONSTRAINT "invoice_requests_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_requests" ADD CONSTRAINT "invoice_requests_duplicate_of_invoice_requests_id_fk" FOREIGN KEY ("duplicate_of") REFERENCES "public"."invoice_requests"("id") ON DELETE no action ON UPDATE no action;
