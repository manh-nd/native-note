ALTER TABLE "tool_calls" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
UPDATE "tool_calls"
SET "idempotency_key" = md5("agent_run_id"::text || ':' || "provider_call_id");--> statement-breakpoint
ALTER TABLE "tool_calls" ALTER COLUMN "idempotency_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tool_calls" ADD COLUMN "reused" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DROP INDEX "tool_calls_run_provider_call_idx";--> statement-breakpoint
DROP INDEX "agent_runs_retry_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "tool_calls_run_idempotency_idx" ON "tool_calls" USING btree ("agent_run_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_runs_retry_idx" ON "agent_runs" USING btree ("retry_of_run_id");
