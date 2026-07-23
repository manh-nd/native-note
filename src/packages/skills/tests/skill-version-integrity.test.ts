import { describe, expect, it } from "vitest";
import {
  createSkillVersionSnapshot,
  verifySkillVersionIntegrity,
} from "../index";
import type { CompiledSkillDraft } from "../index";

describe("Immutable Skill Version Hashing & Lifecycle Manager", () => {
  const compiledDraft: CompiledSkillDraft = {
    instructionSnapshot: "Hãy viết tóm tắt nội dung ngắn gọn trong 3 câu.",
    policy: {
      inputScope: "selection",
      outputMode: "proposal",
      status: "draft",
      allowedTools: ["read-page"],
      approvalPolicy: "required",
      showInEditorMenu: true,
    },
    compilerVersion: "1",
  };

  it("creates an immutable version snapshot with SHA256 content hash", () => {
    const snapshot = createSkillVersionSnapshot({
      skillId: "skill-123",
      versionNumber: 1,
      draft: compiledDraft,
    });

    expect(snapshot.skillId).toBe("skill-123");
    expect(snapshot.versionNumber).toBe(1);
    expect(snapshot.contentHash).toBeDefined();
    expect(snapshot.contentHash.length).toBe(64); // SHA256 hex string length
  });

  it("verifies integrity successfully for untampered snapshot", () => {
    const snapshot = createSkillVersionSnapshot({
      skillId: "skill-123",
      versionNumber: 1,
      draft: compiledDraft,
    });

    const isValid = verifySkillVersionIntegrity(snapshot);
    expect(isValid).toBe(true);
  });

  it("fails integrity check when instructionSnapshot is tampered", () => {
    const snapshot = createSkillVersionSnapshot({
      skillId: "skill-123",
      versionNumber: 1,
      draft: compiledDraft,
    });

    const tampered = {
      ...snapshot,
      instructionSnapshot: "Đã bị thay đổi nội dung độc hại!",
    };

    const isValid = verifySkillVersionIntegrity(tampered);
    expect(isValid).toBe(false);
  });
});
