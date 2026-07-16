ALTER TYPE "public"."agent_run_status" ADD VALUE 'cancelled' BEFORE 'step_limit';--> statement-breakpoint
ALTER TYPE "public"."ai_run_status" ADD VALUE 'cancelled' BEFORE 'step_limit';--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "retry_of_run_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "model_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "cancellation_requested_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "agent_runs_retry_idx" ON "agent_runs" USING btree ("retry_of_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tool_calls_run_provider_call_idx" ON "tool_calls" USING btree ("agent_run_id","provider_call_id");