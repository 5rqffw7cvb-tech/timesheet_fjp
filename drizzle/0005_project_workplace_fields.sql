ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "client_company" text DEFAULT '横河ソリューションサービス株式会社' NOT NULL;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "org_unit" text DEFAULT 'SI　開発部' NOT NULL;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "workplace" text DEFAULT '〒105-0011東京都港区芝公園1丁目7-6' NOT NULL;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "work_name" text DEFAULT 'YOKO Portal 開発' NOT NULL;
--> statement-breakpoint
ALTER TABLE "org_settings" DROP COLUMN IF EXISTS "client_company";
--> statement-breakpoint
ALTER TABLE "org_settings" DROP COLUMN IF EXISTS "org_unit";
--> statement-breakpoint
ALTER TABLE "org_settings" DROP COLUMN IF EXISTS "workplace";
--> statement-breakpoint
ALTER TABLE "org_settings" DROP COLUMN IF EXISTS "work_name";
