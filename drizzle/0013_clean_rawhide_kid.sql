CREATE TYPE "public"."agent_run_status" AS ENUM('running', 'completed', 'failed', 'step_limit');--> statement-breakpoint
CREATE TYPE "public"."tool_approval_state" AS ENUM('not_required', 'required');--> statement-breakpoint
CREATE TYPE "public"."tool_risk" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"page_id" uuid NOT NULL,
	"creator_id" text NOT NULL,
	"status" "agent_run_status" DEFAULT 'running' NOT NULL,
	"prompt_snapshot" text NOT NULL,
	"agent_snapshot" jsonb NOT NULL,
	"tool_snapshots" jsonb NOT NULL,
	"output" text,
	"step_count" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" text NOT NULL,
	"name" text NOT NULL,
	"instructions_page_id" uuid NOT NULL,
	"skill_version_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"allowed_tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"model_policy" jsonb NOT NULL,
	"max_steps" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tool_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_run_id" uuid NOT NULL,
	"provider_call_id" text NOT NULL,
	"name" text NOT NULL,
	"input" jsonb NOT NULL,
	"output" jsonb,
	"risk" "tool_risk",
	"approval_state" "tool_approval_state",
	"failure_code" text,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"duration_ms" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_instructions_page_id_pages_id_fk" FOREIGN KEY ("instructions_page_id") REFERENCES "public"."pages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_calls" ADD CONSTRAINT "tool_calls_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_runs_agent_created_idx" ON "agent_runs" USING btree ("agent_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_runs_page_created_idx" ON "agent_runs" USING btree ("page_id","created_at");--> statement-breakpoint
CREATE INDEX "agents_creator_idx" ON "agents" USING btree ("creator_id","created_at");--> statement-breakpoint
CREATE INDEX "tool_calls_run_started_idx" ON "tool_calls" USING btree ("agent_run_id","started_at");