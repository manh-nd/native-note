ALTER TABLE "schedule_deliveries" ADD COLUMN "agent_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "schedule_deliveries" ADD COLUMN "page_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "schedule_deliveries" ADD COLUMN "prompt_snapshot" text NOT NULL;--> statement-breakpoint
ALTER TABLE "schedule_deliveries" ADD COLUMN "attempt_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "schedule_deliveries" ADD COLUMN "last_attempt_at" timestamp with time zone DEFAULT now() NOT NULL;