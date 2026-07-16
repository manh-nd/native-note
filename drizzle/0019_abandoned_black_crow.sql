ALTER TABLE "document_proposals" ADD COLUMN "agent_run_id" uuid;--> statement-breakpoint
ALTER TABLE "document_proposals" ADD COLUMN "provider_tool_call_id" text;--> statement-breakpoint
ALTER TABLE "document_proposals" ADD COLUMN "tool_call_idempotency_key" text;--> statement-breakpoint
ALTER TABLE "document_proposals" ADD COLUMN "idempotency_scope_id" uuid;--> statement-breakpoint
ALTER TABLE "document_proposals" ADD CONSTRAINT "document_proposals_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_proposals_agent_idempotency_idx" ON "document_proposals" USING btree ("idempotency_scope_id","tool_call_idempotency_key");