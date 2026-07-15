CREATE TYPE "public"."ai_run_source_kind" AS ENUM('selection');--> statement-breakpoint
CREATE TYPE "public"."ai_run_status" AS ENUM('completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."document_proposal_status" AS ENUM('pending', 'accepted', 'rejected', 'stale');--> statement-breakpoint
CREATE TABLE "ai_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"creator_id" text NOT NULL,
	"source_kind" "ai_run_source_kind" NOT NULL,
	"action" text NOT NULL,
	"model" text NOT NULL,
	"status" "ai_run_status" NOT NULL,
	"input_snapshot" text NOT NULL,
	"output_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"source_run_id" uuid NOT NULL,
	"creator_id" text NOT NULL,
	"base_content_revision" integer NOT NULL,
	"operations" jsonb NOT NULL,
	"summary_vi" text NOT NULL,
	"status" "document_proposal_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_proposals" ADD CONSTRAINT "document_proposals_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_proposals" ADD CONSTRAINT "document_proposals_source_run_id_ai_runs_id_fk" FOREIGN KEY ("source_run_id") REFERENCES "public"."ai_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_proposals" ADD CONSTRAINT "document_proposals_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_proposals_page_status_idx" ON "document_proposals" USING btree ("page_id","status");