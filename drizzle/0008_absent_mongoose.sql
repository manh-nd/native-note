CREATE TYPE "public"."skill_approval_policy" AS ENUM('required');--> statement-breakpoint
CREATE TYPE "public"."skill_input_scope" AS ENUM('selection', 'block', 'page');--> statement-breakpoint
CREATE TYPE "public"."skill_output_mode" AS ENUM('proposal', 'read_only');--> statement-breakpoint
CREATE TYPE "public"."skill_status" AS ENUM('draft', 'disabled');--> statement-breakpoint
CREATE TABLE "skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"creator_id" text NOT NULL,
	"input_scope" "skill_input_scope" DEFAULT 'selection' NOT NULL,
	"output_mode" "skill_output_mode" DEFAULT 'proposal' NOT NULL,
	"status" "skill_status" DEFAULT 'draft' NOT NULL,
	"allowed_tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"approval_policy" "skill_approval_policy" DEFAULT 'required' NOT NULL,
	"show_in_editor_menu" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "skills_page_id_idx" ON "skills" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "skills_creator_status_idx" ON "skills" USING btree ("creator_id","status");