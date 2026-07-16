ALTER TABLE "ai_runs" ALTER COLUMN "completed_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tool_calls" ALTER COLUMN "risk" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tool_calls" ALTER COLUMN "approval_state" SET NOT NULL;