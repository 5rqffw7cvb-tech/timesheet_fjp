ALTER TABLE "projects" ADD COLUMN "client_company" text DEFAULT '横河ソリューションサービス株式会社' NOT NULL;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "org_unit" text DEFAULT 'SI　開発部' NOT NULL;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "workplace" text DEFAULT '〒105-0011東京都港区芝公園1丁目7-6' NOT NULL;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "work_name" text DEFAULT 'YOKO Portal 開発' NOT NULL;
--> statement-breakpoint
ALTER TABLE "org_settings" DROP COLUMN "client_company";
--> statement-breakpoint
ALTER TABLE "org_settings" DROP COLUMN "org_unit";
--> statement-breakpoint
ALTER TABLE "org_settings" DROP COLUMN "workplace";
--> statement-breakpoint
ALTER TABLE "org_settings" DROP COLUMN "work_name";
