import { describe, expect, it } from "vitest";
import { createSkillMetadata } from "../index";

describe("Skill metadata", () => {
  it("creates an explicit draft policy without deriving it from Page content", () => {
    expect(createSkillMetadata()).toEqual({
      inputScope: "selection",
      outputMode: "proposal",
      status: "draft",
      allowedTools: [],
      approvalPolicy: "required",
      showInEditorMenu: true,
    });
  });
});
