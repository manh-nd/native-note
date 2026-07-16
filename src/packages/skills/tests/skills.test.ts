import { describe, expect, it } from "vitest";
import { compileSkillDraft, createSkillMetadata } from "../index";

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

  it("compiles supported draft text and normalizes runtime policy into an immutable snapshot", () => {
    expect(
      compileSkillDraft({
        content: {
          type: "doc",
          content: [
            {
              type: "heading",
              attrs: { level: 2 },
              content: [{ type: "text", text: "Improve clarity" }],
            },
            {
              type: "paragraph",
              content: [{ type: "text", text: "Use concise sentences." }],
            },
            {
              type: "bulletList",
              content: [
                {
                  type: "listItem",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Keep my tone." }],
                    },
                  ],
                },
              ],
            },
          ],
        },
        metadata: {
          inputScope: "selection",
          outputMode: "proposal",
          status: "draft",
          allowedTools: [" search ", "search", "read-page"],
          approvalPolicy: "required",
          showInEditorMenu: true,
        },
      })
    ).toEqual({
      instructionSnapshot:
        "Improve clarity\n\nUse concise sentences.\n\n- Keep my tone.",
      policy: {
        inputScope: "selection",
        outputMode: "proposal",
        status: "draft",
        allowedTools: ["read-page", "search"],
        approvalPolicy: "required",
        showInEditorMenu: true,
      },
      compilerVersion: "1",
    });
  });

  it("rejects an empty draft, unsupported structure, and an invalid policy combination with actionable messages", () => {
    expect(() =>
      compileSkillDraft({
        content: { type: "doc", content: [] },
        metadata: createSkillMetadata(),
      })
    ).toThrow("Hướng dẫn Skill không được để trống.");
    expect(() =>
      compileSkillDraft({
        content: {
          type: "doc",
          content: [{ type: "image", attrs: { src: "example.png" } }],
        },
        metadata: createSkillMetadata(),
      })
    ).toThrow('Skill không hỗ trợ cấu trúc "image".');
    expect(() =>
      compileSkillDraft({
        content: {
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Hi" }] },
          ],
        },
        metadata: {
          ...createSkillMetadata(),
          inputScope: "workspace" as never,
        },
      })
    ).toThrow('Skill không hỗ trợ phạm vi "workspace".');
    expect(() =>
      compileSkillDraft({
        content: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "x".repeat(30_001) }],
            },
          ],
        },
        metadata: createSkillMetadata(),
      })
    ).toThrow("Hướng dẫn Skill vượt quá");
  });
});
