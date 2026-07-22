import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  AgentModelError,
  ToolExecutionError,
  createToolRegistry,
  runAgent,
  type ToolRegistry,
} from "../index";

function executeThrough(registry: ToolRegistry) {
  const completed = new Map<string, unknown>();
  return vi.fn(
    async (request: {
      toolCallId: string;
      idempotencyKey: string;
      name: string;
      input: unknown;
    }) => {
      if (completed.has(request.idempotencyKey))
        return {
          status: "reused" as const,
          output: completed.get(request.idempotencyKey),
        };
      try {
        const result = await registry.execute(
          request.name,
          request.input,
          { userId: "user-1", currentPageId: "page-1" },
          [request.name]
        );
        completed.set(request.idempotencyKey, result.output);
        return { status: "completed" as const, output: result.output };
      } catch (error) {
        return {
          status: "failed" as const,
          failureCode:
            error instanceof ToolExecutionError
              ? error.code
              : "TOOL_EXECUTION_FAILED",
        };
      }
    }
  );
}

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
      execution: "read_only",
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
  it("consumes durable ToolCall outcomes and returns a completed terminal status", async () => {
    const model = vi
      .fn()
      .mockResolvedValueOnce({
        text: null,
        calls: [{ id: "call-1", name: "read_current_page", input: {} }],
      })
      .mockResolvedValueOnce({ text: "Your draft is clear.", calls: [] });
    const executeToolCall = vi.fn(async () => ({
      status: "completed" as const,
      output: { pageId: "page-1", text: "Draft" },
    }));

    await expect(
      runAgent({
        definition,
        prompt: "Review the current Page.",
        tools,
        model,
        executeToolCall,
      })
    ).resolves.toMatchObject({
      status: "completed",
      output: "Your draft is clear.",
      steps: 2,
    });
    expect(executeToolCall).toHaveBeenCalledWith({
      toolCallId: "call-1",
      idempotencyKey: expect.stringMatching(/^[a-f0-9]{64}$/),
      name: "read_current_page",
      input: {},
    });
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

  it("appends a completed approval-producing ToolCall outcome to history", async () => {
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
        execution: "read_only",
        authorize: async () => true,
        execute: async () => ({
          recommendationId: "recommendation-1",
          status: "pending" as const,
        }),
      },
    ]);
    const executeToolCall = executeThrough(approvalTools);
    const approvalDefinition = {
      ...definition,
      allowedTools: ["create_learning_item_recommendation"],
    };

    await expect(
      runAgent({
        definition: approvalDefinition,
        prompt: "Recommend a lesson.",
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
        executeToolCall,
      })
    ).resolves.toMatchObject({ status: "completed" });
    expect(executeToolCall).toHaveBeenCalledOnce();
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
        tools,
        model,
        executeToolCall: executeThrough(tools),
      })
    ).resolves.toMatchObject({ status: "step_limit", steps: 6, output: null });
    expect(model).toHaveBeenCalledTimes(6);
  });

  it("ends with the safe failure code from a failed durable ToolCall", async () => {
    const executeToolCall = vi.fn(async () => ({
      status: "failed" as const,
      failureCode: "TOOL_NOT_ALLOWED",
    }));

    await expect(
      runAgent({
        definition,
        prompt: "Edit the Page.",
        tools,
        model: async () => ({
          text: null,
          calls: [{ id: "call-2", name: "create_proposal", input: {} }],
        }),
        executeToolCall,
      })
    ).resolves.toMatchObject({
      status: "failed",
      errorCode: "TOOL_NOT_ALLOWED",
    });
    expect(executeToolCall).toHaveBeenCalledOnce();
  });

  it("cancels during model work and does not execute a later Tool call", async () => {
    const controller = new AbortController();
    const execute = vi.fn(async () => ({ pageId: "page-1", text: "Draft" }));
    const cancellableTools = createReadCurrentPageTools(execute);

    const result = await runAgent({
      definition,
      prompt: "Review the current Page.",
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
      executeToolCall: executeThrough(cancellableTools),
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
        tools: cancellableTools,
        signal: controller.signal,
        model: async () => ({
          text: null,
          calls: [
            { id: "call-1", name: "read_current_page", input: {} },
            { id: "call-2", name: "read_current_page", input: {} },
          ],
        }),
        executeToolCall: executeThrough(cancellableTools),
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
        tools: createReadCurrentPageTools(execute),
        model: async () => ({
          text: null,
          calls: [{ id: "call-1", name: "read_current_page", input: {} }],
        }),
        executeToolCall: executeThrough(createReadCurrentPageTools(execute)),
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
        tools,
        model: transientModel,
        executeToolCall: executeThrough(tools),
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
        tools,
        model: permanentModel,
        executeToolCall: executeThrough(tools),
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
        tools: idempotentTools,
        model,
        executeToolCall: executeThrough(idempotentTools),
      })
    ).resolves.toMatchObject({ status: "completed" });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("appends a reused durable ToolCall output to model history", async () => {
    const model = vi
      .fn()
      .mockResolvedValueOnce({
        text: null,
        calls: [
          { id: "new-provider-call", name: "read_current_page", input: {} },
        ],
      })
      .mockResolvedValueOnce({ text: "Used the original result.", calls: [] });

    const executeToolCall = vi.fn(async () => ({
      status: "reused" as const,
      output: { pageId: "page-1", text: "Original" },
    }));

    await expect(
      runAgent({
        definition,
        prompt: "Retry the run.",
        tools,
        model,
        executeToolCall,
      })
    ).resolves.toMatchObject({ status: "completed" });
    expect(executeToolCall).toHaveBeenCalledOnce();
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
