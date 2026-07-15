ALTER TABLE "pages" ADD COLUMN "content_revision" integer;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "metadata_revision" integer;--> statement-breakpoint
UPDATE "pages" SET "content_revision" = "version", "metadata_revision" = "version";--> statement-breakpoint
ALTER TABLE "pages" ALTER COLUMN "content_revision" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "pages" ALTER COLUMN "content_revision" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "pages" ALTER COLUMN "metadata_revision" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "pages" ALTER COLUMN "metadata_revision" SET NOT NULL;
