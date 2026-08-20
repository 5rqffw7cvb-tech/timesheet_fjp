ALTER TABLE "budgets" ADD COLUMN "unit_price_mm" numeric(12, 2);
--> statement-breakpoint
CREATE TABLE "project_rates" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"project_id" text NOT NULL,
	"effective_from" date NOT NULL,
	"unit_price_mm" numeric(12, 2) NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_rates" ADD CONSTRAINT "project_rates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_rates" ADD CONSTRAINT "project_rates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "project_rates_unique" ON "project_rates" USING btree ("user_id","project_id","effective_from");
--> statement-breakpoint
CREATE INDEX "project_rates_lookup_idx" ON "project_rates" USING btree ("user_id","project_id","effective_from");
