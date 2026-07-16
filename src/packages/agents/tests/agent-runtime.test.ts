import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AgentModelError, createToolRegistry, runAgent } from "../index";

function createReadCurrentPageTools(
  execute = async () => ({ pageId: "page-1", text: "Draft" })
) {
  return createToolRegistry([
    {
      name: "read_current_page",
      description: "Read the current Page snapshot.",
      inputSchema: z.object({}),
      outputSchema: z.object({ pageId: z.string(), text: z.string() }),
      ownership: "current_user",
      risk: "low",
      approval: "not_required",
      authorize: async () => true,
      execute,
    },
  ]);
}

const tools = createReadCurrentPageTools();

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

describe("Agent runtime", () => {
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
      runAgent({
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

  it("audits a Tool-created approval request as pending", async () => {
    const approvalTools = createToolRegistry([
      {
        name: "create_learning_item_recommendation",
        description: "Create a pending LearningItem recommendation.",
        inputSchema: z.object({ evidence: z.string() }),
        outputSchema: z.object({
          recommendationId: z.string(),
          status: z.literal("pending"),
        }),
        ownership: "current_user",
        risk: "medium",
        approval: "required_pending_result",
        authorize: async () => true,
        execute: async () => ({
          recommendationId: "recommendation-1",
          status: "pending" as const,
        }),
      },
    ]);
    const audit = vi.fn(async () => undefined);
    const approvalDefinition = {
      ...definition,
      allowedTools: ["create_learning_item_recommendation"],
    };

    await expect(
      runAgent({
        definition: approvalDefinition,
        prompt: "Recommend a lesson.",
        context: { userId: "user-1", currentPageId: "page-1" },
        tools: approvalTools,
        model: vi
          .fn()
          .mockResolvedValueOnce({
            text: null,
            calls: [
              {
                id: "call-approval",
                name: "create_learning_item_recommendation",
                input: { evidence: "I has a plan." },
              },
            ],
          })
          .mockResolvedValueOnce({ text: "Recommendation ready.", calls: [] }),
        audit,
      })
    ).resolves.toMatchObject({ status: "completed" });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "create_learning_item_recommendation",
        approvalState: "pending",
        risk: "medium",
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
      runAgent({
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
      runAgent({
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

  it("cancels during model work and does not execute a later Tool call", async () => {
    const controller = new AbortController();
    const execute = vi.fn(async () => ({ pageId: "page-1", text: "Draft" }));
    const cancellableTools = createReadCurrentPageTools(execute);

    const result = await runAgent({
      definition,
      prompt: "Review the current Page.",
      context: { userId: "user-1", currentPageId: "page-1" },
      tools: cancellableTools,
      signal: controller.signal,
      model: async ({ signal }) => {
        controller.abort();
        expect(signal?.aborted).toBe(true);
        return {
          text: null,
          calls: [
            { id: "call-after-cancel", name: "read_current_page", input: {} },
          ],
        };
      },
      audit: async () => undefined,
    });

    expect(result).toMatchObject({
      status: "cancelled",
      steps: 1,
      errorCode: "AGENT_CANCELLED",
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("cancels between Tool calls and executes no further Tools", async () => {
    const controller = new AbortController();
    const execute = vi.fn(async () => {
      controller.abort();
      return { pageId: "page-1", text: "Draft" };
    });
    const cancellableTools = createReadCurrentPageTools(execute);

    await expect(
      runAgent({
        definition,
        prompt: "Review the current Page.",
        context: { userId: "user-1", currentPageId: "page-1" },
        tools: cancellableTools,
        signal: controller.signal,
        model: async () => ({
          text: null,
          calls: [
            { id: "call-1", name: "read_current_page", input: {} },
            { id: "call-2", name: "read_current_page", input: {} },
          ],
        }),
        audit: async () => undefined,
      })
    ).resolves.toMatchObject({ status: "cancelled", steps: 1 });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("observes persisted cancellation before executing a Tool", async () => {
    const execute = vi.fn(async () => ({ pageId: "page-1", text: "Draft" }));
    const isCancellationRequested = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    await expect(
      runAgent({
        definition,
        prompt: "Review the current Page.",
        context: { userId: "user-1", currentPageId: "page-1" },
        tools: createReadCurrentPageTools(execute),
        model: async () => ({
          text: null,
          calls: [{ id: "call-1", name: "read_current_page", input: {} }],
        }),
        audit: async () => undefined,
        isCancellationRequested,
      })
    ).resolves.toMatchObject({ status: "cancelled", steps: 1 });
    expect(execute).not.toHaveBeenCalled();
  });

  it("retries transient model failures but stops immediately on permanent failures", async () => {
    const transientModel = vi
      .fn()
      .mockRejectedValueOnce(
        new AgentModelError("AI_RATE_LIMITED", { retryable: true })
      )
      .mockResolvedValueOnce({ text: "Recovered.", calls: [] });

    await expect(
      runAgent({
        definition,
        prompt: "Review the current Page.",
        context: { userId: "user-1", currentPageId: "page-1" },
        tools,
        model: transientModel,
        audit: async () => undefined,
      })
    ).resolves.toMatchObject({
      status: "completed",
      output: "Recovered.",
      steps: 1,
      modelAttempts: 2,
    });

    const permanentModel = vi.fn(async () => {
      throw new AgentModelError("AI_AUTH_FAILED", { retryable: false });
    });
    await expect(
      runAgent({
        definition,
        prompt: "Review the current Page.",
        context: { userId: "user-1", currentPageId: "page-1" },
        tools,
        model: permanentModel,
        audit: async () => undefined,
      })
    ).resolves.toMatchObject({
      status: "failed",
      errorCode: "AI_AUTH_FAILED",
      modelAttempts: 1,
    });
    expect(permanentModel).toHaveBeenCalledTimes(1);
  });

  it("does not repeat a completed Tool call with the same idempotency key", async () => {
    const execute = vi.fn(async () => ({ pageId: "page-1", text: "Draft" }));
    const idempotentTools = createReadCurrentPageTools(execute);
    const model = vi
      .fn()
      .mockResolvedValueOnce({
        text: null,
        calls: [
          { id: "provider-call-1", name: "read_current_page", input: {} },
          { id: "provider-call-2", name: "read_current_page", input: {} },
        ],
      })
      .mockResolvedValueOnce({ text: "Done.", calls: [] });

    await expect(
      runAgent({
        definition,
        prompt: "Review the current Page.",
        context: { userId: "user-1", currentPageId: "page-1" },
        tools: idempotentTools,
        model,
        audit: async () => undefined,
      })
    ).resolves.toMatchObject({ status: "completed" });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("reuses a completed Tool call when retrying a persisted run", async () => {
    const execute = vi.fn(async () => ({ pageId: "page-1", text: "Changed" }));
    const retryTools = createReadCurrentPageTools(execute);
    const model = vi
      .fn()
      .mockResolvedValueOnce({
        text: null,
        calls: [
          { id: "new-provider-call", name: "read_current_page", input: {} },
        ],
      })
      .mockResolvedValueOnce({ text: "Used the original result.", calls: [] });

    const findCompletedToolCallByIdempotencyKey = vi.fn(async () => ({
      name: "read_current_page",
      input: {},
      output: { pageId: "page-1", text: "Original" },
      risk: "low" as const,
      approvalState: "not_required" as const,
    }));
    const audit = vi.fn(async () => undefined);

    await expect(
      runAgent({
        definition,
        prompt: "Retry the run.",
        context: { userId: "user-1", currentPageId: "page-1" },
        tools: retryTools,
        model,
        audit,
        findCompletedToolCallByIdempotencyKey,
      })
    ).resolves.toMatchObject({ status: "completed" });
    expect(execute).not.toHaveBeenCalled();
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        toolCallId: "new-provider-call",
        reused: true,
      })
    );
    expect(findCompletedToolCallByIdempotencyKey).toHaveBeenCalledWith(
      expect.stringMatching(/^[a-f0-9]{64}$/)
    );
    expect(model).toHaveBeenLastCalledWith(
      expect.objectContaining({
        history: expect.arrayContaining([
          expect.objectContaining({
            role: "tool",
            output: { pageId: "page-1", text: "Original" },
          }),
        ]),
      })
    );
  });
});
