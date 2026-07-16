ALTER TABLE "skill_versions" DROP CONSTRAINT "skill_versions_skill_id_skills_id_fk";
--> statement-breakpoint
ALTER TABLE "skill_versions" ADD CONSTRAINT "skill_versions_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE no action ON UPDATE no action;