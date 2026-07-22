CREATE TYPE "public"."tool_execution_status" AS ENUM('executing', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "tool_call_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_scope_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"claimed_by_agent_run_id" uuid NOT NULL,
	"claimed_by_provider_call_id" text NOT NULL,
	"name" text NOT NULL,
	"audit_input" jsonb NOT NULL,
	"audit_output" jsonb,
	"result" jsonb,
	"risk" "tool_risk" NOT NULL,
	"approval_state" "tool_approval_state" NOT NULL,
	"status" "tool_execution_status" NOT NULL,
	"failure_code" text,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"duration_ms" integer
);
--> statement-breakpoint
ALTER TABLE "tool_calls" ADD COLUMN "execution_id" uuid;--> statement-breakpoint
ALTER TABLE "tool_call_executions" ADD CONSTRAINT "tool_call_executions_claimed_by_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("claimed_by_agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tool_call_executions_idempotency_idx" ON "tool_call_executions" USING btree ("idempotency_scope_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "tool_call_executions_claimed_run_idx" ON "tool_call_executions" USING btree ("claimed_by_agent_run_id");--> statement-breakpoint
ALTER TABLE "tool_calls" ADD CONSTRAINT "tool_calls_execution_id_tool_call_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."tool_call_executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tool_calls_execution_idx" ON "tool_calls" USING btree ("execution_id");