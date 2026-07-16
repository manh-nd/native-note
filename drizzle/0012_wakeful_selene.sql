CREATE TABLE "personal_instructions" (
	"user_id" text PRIMARY KEY NOT NULL,
	"active_page_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_runs" ADD COLUMN "instructions_page_id" uuid;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD COLUMN "instructions_content_revision" integer;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD COLUMN "instructions_snapshot" text;--> statement-breakpoint
ALTER TABLE "personal_instructions" ADD CONSTRAINT "personal_instructions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_instructions" ADD CONSTRAINT "personal_instructions_active_page_id_pages_id_fk" FOREIGN KEY ("active_page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;