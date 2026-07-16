ALTER TYPE "public"."ai_run_source_kind" ADD VALUE 'skill';--> statement-breakpoint
ALTER TABLE "ai_runs" ADD COLUMN "content_revision" integer;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD COLUMN "skill_version_id" uuid;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD COLUMN "policy_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_skill_version_id_skill_versions_id_fk" FOREIGN KEY ("skill_version_id") REFERENCES "public"."skill_versions"("id") ON DELETE no action ON UPDATE no action;