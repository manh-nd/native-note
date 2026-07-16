ALTER TYPE "public"."ai_run_source_kind" ADD VALUE 'agent';--> statement-breakpoint
ALTER TYPE "public"."ai_run_status" ADD VALUE 'running' BEFORE 'completed';--> statement-breakpoint
ALTER TYPE "public"."ai_run_status" ADD VALUE 'step_limit';--> statement-breakpoint
ALTER TABLE "tool_calls" ALTER COLUMN "approval_state" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."tool_approval_state";--> statement-breakpoint
CREATE TYPE "public"."tool_approval_state" AS ENUM('not_required', 'pending', 'approved', 'denied');--> statement-breakpoint
ALTER TABLE "tool_calls" ALTER COLUMN "approval_state" SET DATA TYPE "public"."tool_approval_state" USING "approval_state"::"public"."tool_approval_state";--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "source_run_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_source_run_id_ai_runs_id_fk" FOREIGN KEY ("source_run_id") REFERENCES "public"."ai_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_runs_source_run_idx" ON "agent_runs" USING btree ("source_run_id");