ALTER TABLE "pages" ALTER COLUMN "content" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "document_schema_version" integer;--> statement-breakpoint
UPDATE "pages" SET "document_schema_version" = 0;--> statement-breakpoint
ALTER TABLE "pages" ALTER COLUMN "document_schema_version" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "pages" ALTER COLUMN "document_schema_version" SET NOT NULL;
