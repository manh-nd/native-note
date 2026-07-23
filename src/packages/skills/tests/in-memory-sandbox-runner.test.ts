import { describe, expect, it, vi } from "vitest";
import { InMemorySkillSandboxRunner, SkillPermissionError } from "../index";
import type { PublishedSkillPolicy } from "../index";

describe("Headless InMemory Skill Sandbox Runner & Package Assembly", () => {
  const policy: PublishedSkillPolicy = {
    inputScope: "selection",
    outputMode: "proposal",
    status: "draft",
    allowedTools: ["read-page", "suggest-edit"],
    approvalPolicy: "required",
    showInEditorMenu: true,
  };

  it("registers skills and runs allowed tools in headless memory", async () => {
    const runner = new InMemorySkillSandboxRunner();
    const readPageHandler = vi.fn().mockResolvedValue({ text: "Hello World" });

    runner.registerSkill({
      skillId: "skill-1",
      policy,
      tools: {
        "read-page": readPageHandler,
      },
    });

    const result = await runner.runSkillTool("skill-1", "read-page", {
      id: "p1",
    });
    expect(readPageHandler).toHaveBeenCalledWith({ id: "p1" });
    expect(result).toEqual({ text: "Hello World" });
  });

  it("blocks unallowed tools and throws SkillPermissionError in headless mode", async () => {
    const runner = new InMemorySkillSandboxRunner();
    const deleteHandler = vi.fn();

    runner.registerSkill({
      skillId: "skill-1",
      policy,
      tools: {
        "delete-page": deleteHandler,
      },
    });

    await expect(
      runner.runSkillTool("skill-1", "delete-page", { id: "p1" })
    ).rejects.toThrow(SkillPermissionError);
    expect(deleteHandler).not.toHaveBeenCalled();
  });
});
