import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => {
  const state = {
    selects: [] as unknown[][],
    inserts: [] as unknown[][],
    insertErrors: [] as Array<unknown | undefined>,
    insertValues: [] as unknown[],
    updates: [] as unknown[][],
    updateValues: [] as unknown[],
  };
  const select = () => {
    const rows = state.selects.shift() ?? [];
    const query = {
      from: () => query,
      innerJoin: () => query,
      leftJoin: () => query,
      where: () => query,
      orderBy: () => query,
      limit: () => Promise.resolve(rows),
      then: Promise.resolve(rows).then.bind(Promise.resolve(rows)),
    };
    return query;
  };
  const insert = () => {
    const rows = state.inserts.shift() ?? [];
    const error = state.insertErrors.shift();
    const query = {
      values: (value: unknown) => {
        state.insertValues.push(value);
        return query;
      },
      returning: () =>
        error === undefined ? Promise.resolve(rows) : Promise.reject(error),
    };
    return query;
  };
  const update = () => {
    const rows = state.updates.shift() ?? [];
    const query = {
      set: (value: unknown) => {
        state.updateValues.push(value);
        return query;
      },
      where: () => query,
      returning: () => Promise.resolve(rows),
    };
    return query;
  };
  const connection = { select, insert, update };
  return {
    state,
    db: {
      ...connection,
      transaction: async <T>(run: (tx: typeof connection) => Promise<T>) =>
        run(connection),
    },
  };
});

vi.mock("@/db", () => ({ db: database.db }));
vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      message: string,
      public code = "REQUEST_FAILED"
    ) {
      super(message);
    }
  },
}));

import { z } from "zod";
import { createToolRegistry } from "../index";
import {
  cancelAgentRun,
  createAgentDefinition,
  loadAgentRuns,
  retryAgentRun,
  runAgentDefinition,
} from "../server";

describe("Agent definitions", () => {
  beforeEach(() => {
    database.state.selects = [];
    database.state.inserts = [];
    database.state.insertErrors = [];
    database.state.insertValues = [];
    database.state.updates = [];
    database.state.updateValues = [];
  });

  it("persists owned Instructions, published Skills, allowed Tools, model policy, and bounded steps", async () => {
    const created = { id: "agent-1", name: "Coach" };
    database.state.selects.push(
      [{ id: "instructions-1" }],
      [{ id: "version-1" }]
    );
    database.state.inserts.push([created]);

    await expect(
      createAgentDefinition({
        userId: "user-1",
        name: "Coach",
        instructionsPageId: "instructions-1",
        skillVersionIds: ["version-1"],
        allowedTools: [
          "read_current_page",
          "search_learning_memory",
          "create_document_proposal",
        ],
        modelPolicy: { model: "model-1" },
        maxSteps: 4,
      })
    ).resolves.toEqual(created);
    expect(database.state.insertValues[0]).toMatchObject({
      creatorId: "user-1",
      instructionsPageId: "instructions-1",
      skillVersionIds: ["version-1"],
      allowedTools: [
        "read_current_page",
        "search_learning_memory",
        "create_document_proposal",
      ],
      modelPolicy: { model: "model-1" },
      maxSteps: 4,
    });
  });

  it("rejects inaccessible Skill versions and Tools before persistence", async () => {
    database.state.selects.push([{ id: "instructions-1" }], []);
    await expect(
      createAgentDefinition({
        userId: "user-1",
        name: "Coach",
        instructionsPageId: "instructions-1",
        skillVersionIds: ["other-version"],
        allowedTools: ["read_current_page"],
        modelPolicy: { model: "model-1" },
        maxSteps: 2,
      })
    ).rejects.toMatchObject({ code: "AGENT_SKILL_INACCESSIBLE" });

    database.state.selects.push([{ id: "instructions-1" }]);
    await expect(
      createAgentDefinition({
        userId: "user-1",
        name: "Coach",
        instructionsPageId: "instructions-1",
        skillVersionIds: [],
        allowedTools: ["create_proposal"],
        modelPolicy: { model: "model-1" },
        maxSteps: 2,
      })
    ).rejects.toMatchObject({ code: "AGENT_TOOL_INACCESSIBLE" });
    expect(database.state.insertValues).toHaveLength(0);
  });

  it("persists configuration snapshots, redacted ToolCall audits, and the terminal run", async () => {
    const agent = {
      id: "agent-1",
      name: "Coach",
      skillVersionIds: ["version-1"],
      allowedTools: ["read_current_page"],
      modelPolicy: { model: "model-1" },
      maxSteps: 2,
    };
    database.state.selects.push(
      [
        {
          agent,
          instructionsPageId: "instructions-1",
          instructionsContentRevision: 4,
          instructionsSnapshot: "Read only.",
        },
      ],
      [{ id: "page-1" }],
      [
        {
          id: "version-1",
          version: 3,
          instructionSnapshot: "Be concise.",
        },
      ]
    );
    database.state.inserts.push(
      [{ id: "source-run-1" }],
      [{ id: "run-1" }],
      []
    );
    database.state.updates.push(
      [],
      [],
      [],
      [{ id: "run-1", status: "completed", output: "Looks good." }]
    );
    const registry = createToolRegistry([
      {
        name: "read_current_page",
        description: "Read the current Page.",
        inputSchema: z.object({ apiKey: z.string() }).strict(),
        outputSchema: z.object({ text: z.string() }),
        ownership: "current_user",
        risk: "low",
        approval: "not_required",
        authorize: async () => true,
        execute: async () => ({ text: "Draft" }),
      },
    ]);
    const model = vi
      .fn()
      .mockResolvedValueOnce({
        text: null,
        calls: [
          {
            id: "provider-call-1",
            name: "read_current_page",
            input: { apiKey: "secret" },
          },
        ],
      })
      .mockResolvedValueOnce({ text: "Looks good.", calls: [] });

    await expect(
      runAgentDefinition({
        userId: "user-1",
        agentId: "agent-1",
        pageId: "page-1",
        prompt: "Review this Page.",
        model,
        registry,
        isCancellationRequested: async () => false,
      })
    ).resolves.toMatchObject({ status: "completed", output: "Looks good." });

    expect(database.state.insertValues[0]).toMatchObject({
      sourceKind: "agent",
      status: "running",
      model: "model-1",
      instructionsPageId: "instructions-1",
      policySnapshot: {
        agent: expect.objectContaining({ id: "agent-1" }),
        tools: [expect.objectContaining({ name: "read_current_page" })],
      },
    });
    expect(database.state.insertValues[1]).toMatchObject({
      sourceRunId: "source-run-1",
      agentSnapshot: expect.objectContaining({
        instructions: {
          pageId: "instructions-1",
          contentRevision: 4,
          snapshot: "Read only.",
        },
        skillVersions: [
          expect.objectContaining({ id: "version-1", version: 3 }),
        ],
        modelPolicy: { model: "model-1" },
      }),
      toolSnapshots: [expect.objectContaining({ name: "read_current_page" })],
    });
    expect(database.state.insertValues[2]).toMatchObject({
      agentRunId: "run-1",
      providerCallId: "provider-call-1",
      idempotencyKey: expect.stringMatching(/^[a-f0-9]{64}$/),
      input: { apiKey: "[REDACTED]" },
      output: { text: "Draft" },
      failureCode: null,
      reused: false,
    });
    expect(database.state.updateValues).toContainEqual(
      expect.objectContaining({
        status: "completed",
        outputSnapshot: {
          output: "Looks good.",
          stepCount: 2,
          modelAttempts: 2,
          errorCode: null,
        },
      })
    );
    expect(database.state.updateValues).toContainEqual(
      expect.objectContaining({
        status: "completed",
        output: "Looks good.",
        stepCount: 2,
        modelAttempts: 2,
        errorCode: null,
      })
    );
  });

  it("returns the existing AgentRun for a retried ScheduleDelivery", async () => {
    const existing = {
      id: "run-1",
      status: "completed",
      trigger: "scheduled",
      scheduleDeliveryId: "delivery-1",
    };
    database.state.selects.push([existing]);

    await expect(
      runAgentDefinition({
        userId: "user-1",
        agentId: "agent-1",
        pageId: "page-1",
        prompt: "Review this Page.",
        trigger: "scheduled",
        scheduleDeliveryId: "delivery-1",
      })
    ).resolves.toEqual(existing);
    expect(database.state.insertValues).toHaveLength(0);
  });

  it("makes a recommendation actionable only in the same transaction as its ToolCall audit", async () => {
    const agent = {
      id: "agent-1",
      name: "Coach",
      skillVersionIds: [],
      allowedTools: ["create_learning_item_recommendation"],
      modelPolicy: { model: "model-1" },
      maxSteps: 2,
    };
    database.state.selects.push(
      [
        {
          agent,
          instructionsPageId: "instructions-1",
          instructionsContentRevision: 4,
          instructionsSnapshot: "Recommend useful lessons.",
        },
      ],
      [{ id: "page-1", contentRevision: 2 }]
    );
    database.state.inserts.push(
      [{ id: "source-run-1" }],
      [{ id: "run-1" }],
      []
    );
    database.state.updates.push(
      [],
      [{ id: "recommendation-1" }],
      [],
      [],
      [{ id: "run-1", status: "completed", output: "Ready." }]
    );
    const registry = createToolRegistry([
      {
        name: "create_learning_item_recommendation",
        description: "Create a pending LearningItem recommendation.",
        inputSchema: z.object({ lesson: z.string() }),
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
    const model = vi
      .fn()
      .mockResolvedValueOnce({
        text: null,
        calls: [
          {
            id: "provider-call-1",
            name: "create_learning_item_recommendation",
            input: { lesson: "Use have with I." },
          },
        ],
      })
      .mockResolvedValueOnce({ text: "Ready.", calls: [] });

    await expect(
      runAgentDefinition({
        userId: "user-1",
        agentId: "agent-1",
        pageId: "page-1",
        prompt: "Recommend a lesson.",
        model,
        registry,
        isCancellationRequested: async () => false,
      })
    ).resolves.toMatchObject({ status: "completed" });
    expect(database.state.updateValues).toContainEqual({
      auditedAt: expect.any(Date),
    });
    expect(database.state.insertValues).toContainEqual(
      expect.objectContaining({
        name: "create_learning_item_recommendation",
        approvalState: "pending",
        output: {
          recommendationId: "recommendation-1",
          status: "pending",
        },
      })
    );
  });

  it("returns owned run history with model, timing, steps, and redacted ToolCalls", async () => {
    const createdAt = new Date("2026-07-16T10:00:00Z");
    const completedAt = new Date("2026-07-16T10:00:02Z");
    database.state.selects.push(
      [
        {
          id: "run-1",
          status: "failed",
          agentSnapshot: {
            modelPolicy: { model: "model-1" },
          },
          toolSnapshots: [],
          output: null,
          stepCount: 1,
          modelAttempts: 3,
          errorCode: "AI_RATE_LIMITED",
          createdAt,
          completedAt,
        },
      ],
      [
        {
          id: "tool-call-1",
          agentRunId: "run-1",
          providerCallId: "provider-call-1",
          name: "read_current_page",
          input: { apiKey: "[REDACTED]" },
          output: null,
          risk: "low",
          approvalState: "not_required",
          failureCode: "TOOL_EXECUTION_FAILED",
          startedAt: createdAt,
          completedAt,
          durationMs: 2_000,
        },
      ]
    );

    await expect(loadAgentRuns("user-1", "agent-1")).resolves.toEqual([
      expect.objectContaining({
        id: "run-1",
        status: "failed",
        modelSnapshot: { model: "model-1" },
        steps: 1,
        modelAttempts: 3,
        durationMs: 2_000,
        errorCode: "AI_RATE_LIMITED",
        toolCalls: [
          expect.objectContaining({
            input: { apiKey: "[REDACTED]" },
            failureCode: "TOOL_EXECUTION_FAILED",
          }),
        ],
      }),
    ]);
  });

  it("cancels only an owned running AgentRun and its source AI run", async () => {
    database.state.selects.push([
      {
        id: "run-1",
        sourceRunId: "source-run-1",
        stepCount: 2,
        modelAttempts: 3,
      },
    ]);
    database.state.updates.push([], [{ id: "run-1", status: "cancelled" }]);

    await expect(
      cancelAgentRun("user-1", "agent-1", "run-1")
    ).resolves.toMatchObject({ status: "cancelled" });
    expect(database.state.updateValues[0]).toMatchObject({
      status: "cancelled",
      outputSnapshot: expect.objectContaining({
        stepCount: 2,
        modelAttempts: 3,
        errorCode: "AGENT_CANCELLED",
      }),
    });
    expect(database.state.updateValues[1]).toMatchObject({
      status: "cancelled",
      errorCode: "AGENT_CANCELLED",
      cancellationRequestedAt: expect.any(Date),
    });
  });

  it("returns the existing retry for a duplicate retry request", async () => {
    const existingRetry = {
      id: "retry-run-1",
      retryOfRunId: "run-1",
      status: "running",
    };
    database.state.selects.push([existingRetry]);

    await expect(
      retryAgentRun({
        userId: "user-1",
        agentId: "agent-1",
        runId: "run-1",
      })
    ).resolves.toEqual(existingRetry);
    expect(database.state.insertValues).toHaveLength(0);
  });

  it("returns the winning retry when concurrent creation loses the unique race", async () => {
    const agent = {
      id: "agent-1",
      name: "Coach",
      skillVersionIds: [],
      allowedTools: ["read_current_page"],
      modelPolicy: { model: "model-1" },
      maxSteps: 2,
    };
    const winningRetry = {
      id: "retry-run-winner",
      retryOfRunId: "run-1",
      status: "running",
    };
    database.state.selects.push(
      [],
      [
        {
          id: "run-1",
          pageId: "page-1",
          promptSnapshot: "Retry me.",
          retryRootRunId: null,
          status: "failed",
        },
      ],
      [{ id: "run-1" }],
      [],
      [
        {
          agent,
          instructionsPageId: "instructions-1",
          instructionsContentRevision: 4,
          instructionsSnapshot: "Read only.",
        },
      ],
      [{ id: "page-1", contentRevision: 2 }],
      [winningRetry]
    );
    database.state.inserts.push([{ id: "source-run-loser" }], []);
    database.state.insertErrors.push(undefined, { code: "23505" });

    await expect(
      retryAgentRun({
        userId: "user-1",
        agentId: "agent-1",
        runId: "run-1",
      })
    ).resolves.toEqual(winningRetry);
  });
});
