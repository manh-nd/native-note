CREATE INDEX "findings_proposal_status_idx" ON "findings" USING btree ("proposal_id","status");--> statement-breakpoint
CREATE INDEX "reviews_page_content_revision_idx" ON "reviews" USING btree ("page_id","content_revision");--> statement-breakpoint
ALTER TABLE "pages" DROP COLUMN "version";--> statement-breakpoint
ALTER TABLE "reviews" DROP COLUMN "page_version";