CREATE TYPE "public"."learning_item_recommendation_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "agent_learning_item_recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"page_id" uuid NOT NULL,
	"source_run_id" uuid NOT NULL,
	"agent_run_id" uuid NOT NULL,
	"provider_tool_call_id" text NOT NULL,
	"tool_call_idempotency_key" text NOT NULL,
	"idempotency_scope_id" uuid NOT NULL,
	"category" "finding_category" NOT NULL,
	"original_pattern" text NOT NULL,
	"target_expression" text NOT NULL,
	"explanation" text NOT NULL,
	"source_evidence" text NOT NULL,
	"status" "learning_item_recommendation_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "learning_items" ADD COLUMN "agent_recommendation_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_learning_item_recommendations" ADD CONSTRAINT "agent_learning_item_recommendations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_learning_item_recommendations" ADD CONSTRAINT "agent_learning_item_recommendations_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_learning_item_recommendations" ADD CONSTRAINT "agent_learning_item_recommendations_source_run_id_ai_runs_id_fk" FOREIGN KEY ("source_run_id") REFERENCES "public"."ai_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_learning_item_recommendations" ADD CONSTRAINT "agent_learning_item_recommendations_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_learning_recommendations_user_status_idx" ON "agent_learning_item_recommendations" USING btree ("user_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_learning_recommendations_idempotency_idx" ON "agent_learning_item_recommendations" USING btree ("idempotency_scope_id","tool_call_idempotency_key");--> statement-breakpoint
ALTER TABLE "learning_items" ADD CONSTRAINT "learning_items_agent_recommendation_id_agent_learning_item_recommendations_id_fk" FOREIGN KEY ("agent_recommendation_id") REFERENCES "public"."agent_learning_item_recommendations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_items" ADD CONSTRAINT "learning_items_agent_recommendation_id_unique" UNIQUE("agent_recommendation_id");