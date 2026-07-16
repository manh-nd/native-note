import type { PublishedSkillPolicy } from "./skill-compiler";
import type { SkillInputScope } from "./skill-metadata";

export type MenuSkill = {
  id: string;
  pageId: string;
  title: string;
  activeVersionId: string | null;
  versionId: string;
  policy: PublishedSkillPolicy;
};

export function menuSkillsForScope<T extends MenuSkill>(
  skills: T[],
  scope: SkillInputScope
) {
  return skills.filter(
    (skill) =>
      skill.activeVersionId === skill.versionId &&
      skill.policy.inputScope === scope &&
      skill.policy.status !== "disabled" &&
      skill.policy.showInEditorMenu
  );
}
