CREATE TYPE "public"."day_type" AS ENUM('WORK', 'PUBLIC_OFF', 'SUB_OFF', 'HOLIDAY_WORK');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('ADMIN', 'MEMBER');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"target" text,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"project_id" text NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"hours" numeric(7, 2) NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companies_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "day_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"start_min" integer,
	"end_min" integer,
	"break_min" integer DEFAULT 60 NOT NULL,
	"day_type" "day_type" DEFAULT 'WORK' NOT NULL,
	"leave_note" text,
	"remark" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holidays" (
	"id" text PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT '公休' NOT NULL,
	CONSTRAINT "holidays_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "month_settings" (
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"working_days" integer DEFAULT 0 NOT NULL,
	"locked_at" timestamp with time zone,
	CONSTRAINT "month_settings_year_month_pk" PRIMARY KEY("year","month")
);
--> statement-breakpoint
CREATE TABLE "monthly_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"status" "report_status" DEFAULT 'DRAFT' NOT NULL,
	"submitted_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"reviewer_id" text,
	"review_note" text,
	"member_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"client_company" text DEFAULT '横河ソリューションサービス株式会社' NOT NULL,
	"org_unit" text DEFAULT 'SI　開発部' NOT NULL,
	"workplace" text DEFAULT '〒105-0011東京都港区芝公園1丁目7-6' NOT NULL,
	"work_name" text DEFAULT 'YOKO Portal 開発' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"system_code" text NOT NULL,
	"system_name" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"start_date" date,
	"end_date" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "time_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"project_id" text NOT NULL,
	"work_type_id" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"hours" numeric(5, 2) NOT NULL,
	"is_plan" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"full_name" text NOT NULL,
	"display_name" text,
	"employee_code" text,
	"role_title" text,
	"location" text,
	"role" "role" DEFAULT 'MEMBER' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"must_change_pw" boolean DEFAULT true NOT NULL,
	"company_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "work_types" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"note" text,
	"category" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "work_types_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_logs" ADD CONSTRAINT "day_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_reports" ADD CONSTRAINT "monthly_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_work_type_id_work_types_id_fk" FOREIGN KEY ("work_type_id") REFERENCES "public"."work_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "budgets_unique" ON "budgets" USING btree ("user_id","project_id","year","month");--> statement-breakpoint
CREATE INDEX "budgets_period_idx" ON "budgets" USING btree ("year","month");--> statement-breakpoint
CREATE UNIQUE INDEX "day_logs_unique" ON "day_logs" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "day_logs_date_idx" ON "day_logs" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "monthly_reports_unique" ON "monthly_reports" USING btree ("user_id","year","month");--> statement-breakpoint
CREATE INDEX "monthly_reports_period_idx" ON "monthly_reports" USING btree ("year","month","status");--> statement-breakpoint
CREATE INDEX "projects_active_idx" ON "projects" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "time_entries_user_date_idx" ON "time_entries" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "time_entries_date_idx" ON "time_entries" USING btree ("date");--> statement-breakpoint
CREATE INDEX "users_active_idx" ON "users" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "work_types_active_idx" ON "work_types" USING btree ("is_active");