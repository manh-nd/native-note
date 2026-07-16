import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createToolRegistry, runReadOnlyAgent } from "../index";

const tools = createToolRegistry([
  {
    name: "read_current_page",
    description: "Read the current Page snapshot.",
    inputSchema: z.object({}),
    outputSchema: z.object({ pageId: z.string(), text: z.string() }),
    ownership: "current_user",
    risk: "low",
    approval: "not_required",
    authorize: async () => true,
    execute: async () => ({ pageId: "page-1", text: "Draft" }),
  },
]);

const definition = {
  id: "agent-1",
  name: "Writing coach",
  instructions: {
    pageId: "instructions-1",
    contentRevision: 4,
    snapshot: "Coach without editing the Page.",
  },
  skillVersions: [
    { id: "skill-version-1", version: 2, instructionSnapshot: "Be concise." },
  ],
  allowedTools: ["read_current_page"],
  modelPolicy: { model: "model-1" },
  maxSteps: 2,
};

describe("read-only Agent runtime", () => {
  it("executes allowed Tools sequentially and returns a completed terminal status", async () => {
    const model = vi
      .fn()
      .mockResolvedValueOnce({
        text: null,
        calls: [{ id: "call-1", name: "read_current_page", input: {} }],
      })
      .mockResolvedValueOnce({ text: "Your draft is clear.", calls: [] });
    const audit = vi.fn(async () => undefined);

    await expect(
      runReadOnlyAgent({
        definition,
        prompt: "Review the current Page.",
        context: { userId: "user-1", currentPageId: "page-1" },
        tools,
        model,
        audit,
      })
    ).resolves.toMatchObject({
      status: "completed",
      output: "Your draft is clear.",
      steps: 2,
    });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "read_current_page",
        input: {},
        output: { pageId: "page-1", text: "Draft" },
        approvalState: "not_required",
        risk: "low",
      })
    );
    expect(model).toHaveBeenLastCalledWith(
      expect.objectContaining({
        agentSnapshot: expect.objectContaining({
          id: "agent-1",
          instructions: definition.instructions,
          skillVersions: definition.skillVersions,
          allowedTools: ["read_current_page"],
          modelPolicy: { model: "model-1" },
        }),
        history: expect.arrayContaining([
          expect.objectContaining({
            role: "tool",
            toolCallId: "call-1",
            output: { pageId: "page-1", text: "Draft" },
          }),
        ]),
      })
    );
  });

  it("stops at the configured maximum and never exceeds the platform limit of six", async () => {
    const model = vi.fn(async () => ({
      text: null,
      calls: [
        { id: crypto.randomUUID(), name: "read_current_page", input: {} },
      ],
    }));

    await expect(
      runReadOnlyAgent({
        definition: { ...definition, maxSteps: 99 },
        prompt: "Loop forever.",
        context: { userId: "user-1", currentPageId: "page-1" },
        tools,
        model,
        audit: async () => undefined,
      })
    ).resolves.toMatchObject({ status: "step_limit", steps: 6, output: null });
    expect(model).toHaveBeenCalledTimes(6);
  });

  it("audits invalid Tool calls and ends with a failed terminal status", async () => {
    const audit = vi.fn(async () => undefined);

    await expect(
      runReadOnlyAgent({
        definition,
        prompt: "Edit the Page.",
        context: { userId: "user-1", currentPageId: "page-1" },
        tools,
        model: async () => ({
          text: null,
          calls: [{ id: "call-2", name: "create_proposal", input: {} }],
        }),
        audit,
      })
    ).resolves.toMatchObject({
      status: "failed",
      errorCode: "TOOL_NOT_ALLOWED",
    });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "create_proposal",
        failureCode: "TOOL_NOT_ALLOWED",
      })
    );
  });
});
