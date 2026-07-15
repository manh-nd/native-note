ALTER TABLE "reviews" DROP CONSTRAINT "reviews_source_run_id_ai_runs_id_fk";
--> statement-breakpoint
UPDATE "reviews"
SET
  "source_run_id" = gen_random_uuid(),
  "content_revision" = "page_version"
WHERE "source_run_id" IS NULL OR "content_revision" IS NULL;
--> statement-breakpoint
INSERT INTO "ai_runs" (
  "id",
  "page_id",
  "creator_id",
  "source_kind",
  "action",
  "model",
  "status",
  "input_snapshot",
  "output_snapshot",
  "created_at",
  "completed_at"
)
SELECT
  "reviews"."source_run_id",
  "reviews"."page_id",
  "workspaces"."user_id",
  'review',
  'review',
  "reviews"."model",
  'completed',
  "reviews"."snapshot",
  jsonb_build_object('migratedFromReview', true),
  "reviews"."created_at",
  "reviews"."created_at"
FROM "reviews"
INNER JOIN "pages" ON "pages"."id" = "reviews"."page_id"
INNER JOIN "workspaces" ON "workspaces"."id" = "pages"."workspace_id"
WHERE NOT EXISTS (
  SELECT 1 FROM "ai_runs" WHERE "ai_runs"."id" = "reviews"."source_run_id"
);
--> statement-breakpoint
ALTER TABLE "reviews" ALTER COLUMN "source_run_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ALTER COLUMN "content_revision" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_source_run_id_ai_runs_id_fk" FOREIGN KEY ("source_run_id") REFERENCES "public"."ai_runs"("id") ON DELETE no action ON UPDATE no action;
