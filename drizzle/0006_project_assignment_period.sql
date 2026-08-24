ALTER TABLE "project_assignments" ADD COLUMN IF NOT EXISTS "start_date" date;
--> statement-breakpoint
ALTER TABLE "project_assignments" ADD COLUMN IF NOT EXISTS "end_date" date;
