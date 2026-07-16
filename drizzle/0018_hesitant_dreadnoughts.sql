DROP INDEX "tool_calls_run_idempotency_idx";--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "retry_root_run_id" uuid;--> statement-breakpoint
CREATE INDEX "agent_runs_retry_root_idx" ON "agent_runs" USING btree ("retry_root_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tool_calls_run_provider_call_idx" ON "tool_calls" USING btree ("agent_run_id","provider_call_id");--> statement-breakpoint
CREATE INDEX "tool_calls_run_idempotency_idx" ON "tool_calls" USING btree ("agent_run_id","idempotency_key");