DO $$ BEGIN
 CREATE TYPE "public"."manager_level" AS ENUM('NONE', 'PM', 'DM');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "manager_level" "manager_level" DEFAULT 'NONE' NOT NULL;
