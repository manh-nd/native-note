import { describe, expect, it, vi } from "vitest";
import { SkillPermissionError, SkillSandboxExecutor } from "../index";
import type { PublishedSkillPolicy } from "../index";

describe("Skill Sandbox Tool Whitelist Proxy Executor", () => {
  const policy: PublishedSkillPolicy = {
    inputScope: "selection",
    outputMode: "proposal",
    status: "draft",
    allowedTools: ["read-page", "suggest-edit"],
    approvalPolicy: "required",
    showInEditorMenu: true,
  };

  it("executes allowed tools successfully", async () => {
    const readPageFn = vi
      .fn()
      .mockResolvedValue({ content: "Sample Page Content" });
    const executor = new SkillSandboxExecutor({
      policy,
      tools: {
        "read-page": readPageFn,
      },
    });

    const result = await executor.executeTool("read-page", { pageId: "p1" });
    expect(readPageFn).toHaveBeenCalledWith({ pageId: "p1" });
    expect(result).toEqual({ content: "Sample Page Content" });
  });

  it("throws SkillPermissionError when attempting to execute an unallowed tool", async () => {
    const deletePageFn = vi.fn();
    const executor = new SkillSandboxExecutor({
      policy,
      tools: {
        "delete-page": deletePageFn,
      },
    });

    await expect(
      executor.executeTool("delete-page", { pageId: "p1" })
    ).rejects.toThrow(SkillPermissionError);
    expect(deletePageFn).not.toHaveBeenCalled();
  });
});
