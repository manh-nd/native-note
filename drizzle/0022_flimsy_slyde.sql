CREATE TYPE "public"."agent_run_trigger" AS ENUM('manual', 'scheduled');--> statement-breakpoint
CREATE TYPE "public"."agent_schedule_frequency" AS ENUM('daily', 'weekly');--> statement-breakpoint
CREATE TYPE "public"."schedule_delivery_status" AS ENUM('claimed', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "agent_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" text NOT NULL,
	"agent_id" uuid NOT NULL,
	"page_id" uuid NOT NULL,
	"prompt" text NOT NULL,
	"frequency" "agent_schedule_frequency" NOT NULL,
	"weekday" integer,
	"local_hour" integer NOT NULL,
	"local_minute" integer NOT NULL,
	"time_zone" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"next_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"creator_id" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"status" "schedule_delivery_status" DEFAULT 'claimed' NOT NULL,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "trigger" "agent_run_trigger" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "schedule_delivery_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_schedules" ADD CONSTRAINT "agent_schedules_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_schedules" ADD CONSTRAINT "agent_schedules_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_schedules" ADD CONSTRAINT "agent_schedules_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_deliveries" ADD CONSTRAINT "schedule_deliveries_schedule_id_agent_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."agent_schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_deliveries" ADD CONSTRAINT "schedule_deliveries_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_schedules_creator_idx" ON "agent_schedules" USING btree ("creator_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_schedules_agent_idx" ON "agent_schedules" USING btree ("agent_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_schedules_due_idx" ON "agent_schedules" USING btree ("enabled","next_run_at");--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_deliveries_occurrence_idx" ON "schedule_deliveries" USING btree ("schedule_id","due_at");--> statement-breakpoint
CREATE INDEX "schedule_deliveries_creator_idx" ON "schedule_deliveries" USING btree ("creator_id","created_at");--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_schedule_delivery_id_schedule_deliveries_id_fk" FOREIGN KEY ("schedule_delivery_id") REFERENCES "public"."schedule_deliveries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_runs_schedule_delivery_idx" ON "agent_runs" USING btree ("schedule_delivery_id");