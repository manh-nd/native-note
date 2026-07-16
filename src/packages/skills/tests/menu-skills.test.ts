import { describe, expect, it } from "vitest";
import { menuSkillsForScope } from "../index";

const published = {
  id: "skill-1",
  pageId: "skill-page-1",
  title: "Make concise",
  activeVersionId: "version-1",
  versionId: "version-1",
  policy: {
    inputScope: "selection" as const,
    outputMode: "proposal" as const,
    status: "draft" as const,
    allowedTools: [],
    approvalPolicy: "required" as const,
    showInEditorMenu: true,
  },
};

describe("published Skill menu discovery", () => {
  it("returns only active, enabled, menu-visible Skills compatible with the surface", () => {
    const result = menuSkillsForScope(
      [
        published,
        {
          ...published,
          id: "hidden",
          policy: { ...published.policy, showInEditorMenu: false },
        },
        {
          ...published,
          id: "disabled",
          policy: { ...published.policy, status: "disabled" as const },
        },
        {
          ...published,
          id: "block",
          policy: { ...published.policy, inputScope: "block" as const },
        },
        { ...published, id: "stale", activeVersionId: "new-version" },
      ],
      "selection"
    );

    expect(result).toEqual([published]);
  });
});
