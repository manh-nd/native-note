import { describe, expect, it } from "vitest";
import {
  compileSkillDraft,
  SkillCompilationError,
  SkillValidationError,
  validateSkillPolicy,
} from "../index";
import type { SkillMetadata } from "../index";

describe("Skill Compiler Policy Validator & Error Handling", () => {
  const validMetadata: SkillMetadata = {
    inputScope: "selection",
    outputMode: "proposal",
    status: "draft",
    allowedTools: ["read-page", "suggest-edit"],
    approvalPolicy: "required",
    showInEditorMenu: true,
  };

  it("validates valid skill policy metadata without error", () => {
    expect(() => validateSkillPolicy(validMetadata)).not.toThrow();
  });

  it("throws SkillValidationError on invalid inputScope", () => {
    const invalid = { ...validMetadata, inputScope: "global" as any };
    expect(() => validateSkillPolicy(invalid)).toThrow(SkillValidationError);
    expect(() => validateSkillPolicy(invalid)).toThrow(
      'Skill không hỗ trợ phạm vi "global".'
    );
  });

  it("throws SkillValidationError on invalid outputMode", () => {
    const invalid = { ...validMetadata, outputMode: "auto_apply" as any };
    expect(() => validateSkillPolicy(invalid)).toThrow(SkillValidationError);
  });

  it("throws SkillCompilationError on empty document content", () => {
    const emptyDoc = { type: "doc", content: [] };
    expect(() =>
      compileSkillDraft({ content: emptyDoc, metadata: validMetadata })
    ).toThrow(SkillCompilationError);
  });
});
