ALTER TABLE "users" ADD COLUMN "billing_unit_price" numeric(12, 2) DEFAULT '0' NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "billing_factor" numeric(6, 2) DEFAULT '1' NOT NULL;
