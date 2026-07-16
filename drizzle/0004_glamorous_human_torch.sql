ALTER TYPE "public"."ai_run_source_kind" ADD VALUE 'review';--> statement-breakpoint
ALTER TABLE "findings" ADD COLUMN "proposal_id" uuid;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "source_run_id" uuid;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "content_revision" integer;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_proposal_id_document_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."document_proposals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_source_run_id_ai_runs_id_fk" FOREIGN KEY ("source_run_id") REFERENCES "public"."ai_runs"("id") ON DELETE set null ON UPDATE no action;
