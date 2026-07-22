import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createToolRegistry } from "../index";
import {
  createDurableToolCallExecutor,
  type DurableToolCallExecution,
  type DurableToolCallIdentity,
  type DurableToolCallInvocation,
  type DurableToolCallStore,
  type DurableToolCallStoreTransaction,
} from "../tool-execution";

type TestDatabaseTransaction = { records: string[] };

function createStore({
  failInvocation = false,
}: { failInvocation?: boolean } = {}) {
  const executions = new Map<string, DurableToolCallExecution>();
  const invocations: DurableToolCallInvocation[] = [];
  const records: string[] = [];
  const locks = new Map<string, Promise<void>>();
  const recordInvocation = vi.fn(
    async (invocation: DurableToolCallInvocation) => {
      if (failInvocation) throw new Error("audit persistence unavailable");
      const existingIndex = invocations.findIndex(
        (existing) =>
          existing.agentRunId === invocation.agentRunId &&
          existing.providerCallId === invocation.providerCallId &&
          existing.idempotencyKey === invocation.idempotencyKey
      );
      if (existingIndex === -1) invocations.push(invocation);
      else invocations[existingIndex] = invocation;
    }
  );

  async function acquire(key: string) {
    const previous = locks.get(key) ?? Promise.resolve();
    let unlock: () => void = () => undefined;
    const current = previous.then(
      () =>
        new Promise<void>((resolve) => {
          unlock = resolve;
        })
    );
    locks.set(key, current);
    await previous;
    return () => {
      unlock();
      if (locks.get(key) === current) locks.delete(key);
    };
  }

  const store: DurableToolCallStore = {
    async transaction<T>(
      identity: DurableToolCallIdentity,
      run: (transaction: DurableToolCallStoreTransaction) => Promise<T>
    ) {
      const key = `${identity.idempotencyScopeId}:${identity.idempotencyKey}`;
      const lockKeys = [
        `execution:${key}`,
        `invocation:${identity.agentRunId}:${identity.providerCallId}`,
      ].sort();
      const releases: Array<() => void> = [];
      for (const lockKey of lockKeys) releases.push(await acquire(lockKey));
      const executionBefore = executions.get(key);
      const invocationCountBefore = invocations.length;
      const recordsBefore = [...records];
      const transaction: DurableToolCallStoreTransaction = {
        loadInvocation: async () =>
          invocations.find(
            (invocation) =>
              invocation.agentRunId === identity.agentRunId &&
              invocation.providerCallId === identity.providerCallId &&
              invocation.idempotencyKey === identity.idempotencyKey
          ),
        loadExecution: async () => executions.get(key),
        claimExecution: async (execution) => {
          const id = executions.get(key)?.id ?? crypto.randomUUID();
          executions.set(key, { ...execution, id, status: "executing" });
          return id;
        },
        executeTool: async (operation) => {
          const savepoint = [...records];
          try {
            return await operation({ records } as never);
          } catch (error) {
            records.splice(0, records.length, ...savepoint);
            throw error;
          }
        },
        completeExecution: async (execution) => {
          executions.set(key, execution);
        },
        failExecution: async (execution) => {
          executions.set(key, execution);
        },
        recordInvocation,
      };
      try {
        return await run(transaction);
      } catch (error) {
        if (executionBefore) executions.set(key, executionBefore);
        else executions.delete(key);
        invocations.splice(invocationCountBefore);
        records.splice(0, records.length, ...recordsBefore);
        throw error;
      } finally {
        for (const release of releases.reverse()) release();
      }
    },
  };

  return { store, executions, invocations, records, recordInvocation };
}

function createSideEffectingExecutor(
  store: DurableToolCallStore,
  {
    execute = vi.fn(
      async (_context: unknown, _input: unknown, transaction?: unknown) => {
        (transaction as TestDatabaseTransaction).records.push("record-1");
        return { recordId: "record-1" };
      }
    ),
    agentRunId = "agent-run-1",
  } = {}
) {
  const registry = createToolRegistry([
    {
      name: "side_effecting_tool",
      description: "Persist one domain record.",
      inputSchema: z.object({ value: z.string().optional() }).strict(),
      outputSchema: z.object({ recordId: z.string() }),
      ownership: "current_user",
      risk: "medium",
      approval: "not_required",
      execution: "database_transaction",
      authorize: async (): Promise<boolean> => true,
      execute,
    },
  ]);
  return {
    execute,
    executeToolCall: createDurableToolCallExecutor({
      registry,
      store,
      context: { userId: "user-1", currentPageId: "page-1" },
      allowedTools: ["side_effecting_tool"],
      provenance: {
        sourceRunId: "source-run-1",
        agentRunId,
        idempotencyScopeId: "retry-root-1",
      },
    }),
  };
}

const request = {
  toolCallId: "provider-call-1",
  idempotencyKey: "idempotency-1",
  name: "side_effecting_tool",
  input: {},
};

describe("durable ToolCall execution", () => {
  it("rolls back a database-backed Tool when audit persistence fails without attempting a failure audit", async () => {
    const persistence = createStore({ failInvocation: true });
    const { execute, executeToolCall } = createSideEffectingExecutor(
      persistence.store
    );

    await expect(executeToolCall(request)).resolves.toEqual({
      status: "failed",
      failureCode: "TOOL_PERSISTENCE_FAILED",
    });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(persistence.recordInvocation).toHaveBeenCalledTimes(1);
    expect(persistence.records).toEqual([]);
  });

  it("does not commit a database-backed Tool when its output is invalid", async () => {
    const persistence = createStore();
    const registry = createToolRegistry([
      {
        name: "side_effecting_tool",
        description: "Persist one domain record.",
        inputSchema: z.object({}).strict(),
        outputSchema: z.object({ recordId: z.string() }),
        ownership: "current_user",
        risk: "medium",
        approval: "not_required",
        execution: "database_transaction",
        authorize: async () => true,
        execute: async (_context, _input, transaction?: unknown) => {
          (transaction as TestDatabaseTransaction).records.push("record-1");
          return { unexpected: true };
        },
      },
    ]);
    const executeToolCall = createDurableToolCallExecutor({
      registry,
      store: persistence.store,
      context: { userId: "user-1", currentPageId: "page-1" },
      allowedTools: ["side_effecting_tool"],
      provenance: {
        sourceRunId: "source-run-1",
        agentRunId: "agent-run-1",
        idempotencyScopeId: "retry-root-1",
      },
    });

    await expect(executeToolCall(request)).resolves.toEqual({
      status: "failed",
      failureCode: "TOOL_OUTPUT_INVALID",
    });

    expect(persistence.records).toEqual([]);
    expect(persistence.invocations).toEqual([
      expect.objectContaining({
        input: {},
        failureCode: "TOOL_OUTPUT_INVALID",
      }),
    ]);
  });

  it("serializes concurrent claims for one retry-lineage idempotency key", async () => {
    const persistence = createStore();
    const execute = vi.fn(
      async (_context: unknown, _input: unknown, transaction?: unknown) => {
        await Promise.resolve();
        (transaction as TestDatabaseTransaction).records.push("record-1");
        return { recordId: "record-1" };
      }
    );
    const first = createSideEffectingExecutor(persistence.store, {
      execute,
      agentRunId: "agent-run-1",
    }).executeToolCall;
    const second = createSideEffectingExecutor(persistence.store, {
      execute,
      agentRunId: "agent-run-2",
    }).executeToolCall;

    await expect(
      Promise.all([
        first(request),
        second({ ...request, toolCallId: "provider-call-2" }),
      ])
    ).resolves.toEqual([
      { status: "completed", output: { recordId: "record-1" } },
      { status: "reused", output: { recordId: "record-1" } },
    ]);

    expect(execute).toHaveBeenCalledTimes(1);
    expect(persistence.records).toEqual(["record-1"]);
    expect(persistence.invocations).toHaveLength(2);
  });

  it("reuses the committed model result while retaining sanitized audit history and approval state", async () => {
    vi.useFakeTimers();
    const persistence = createStore();
    const execute = vi.fn(
      async (_context: unknown, _input: unknown, transaction?: unknown) => {
        (transaction as TestDatabaseTransaction).records.push("record-1");
        return { recordId: "record-1", privateValue: "model-visible" };
      }
    );
    const registry = createToolRegistry([
      {
        name: "side_effecting_tool",
        description: "Persist one approval-producing domain record.",
        inputSchema: z.object({ privateValue: z.string() }).strict(),
        outputSchema: z.object({
          recordId: z.string(),
          privateValue: z.string(),
        }),
        ownership: "current_user",
        risk: "medium",
        approval: "required_pending_result",
        execution: "database_transaction",
        audit: {
          mode: "redacted",
          input: () => ({ privateValue: "[REDACTED]" }),
          output: (output) => ({
            recordId: (output as { recordId: string }).recordId,
            privateValue: "[REDACTED]",
          }),
        },
        authorize: async () => true,
        execute,
      },
    ]);
    const createExecutor = (agentRunId: string) =>
      createDurableToolCallExecutor({
        registry,
        store: persistence.store,
        context: { userId: "user-1", currentPageId: "page-1" },
        allowedTools: ["side_effecting_tool"],
        provenance: {
          sourceRunId: `${agentRunId}-source`,
          agentRunId,
          idempotencyScopeId: "retry-root-1",
        },
      });
    const privateRequest = {
      ...request,
      input: { privateValue: "model-input" },
    };

    try {
      vi.setSystemTime(new Date("2026-07-22T10:00:00.000Z"));
      await expect(
        createExecutor("agent-run-1")(privateRequest)
      ).resolves.toEqual({
        status: "completed",
        output: { recordId: "record-1", privateValue: "model-visible" },
      });
      vi.setSystemTime(new Date("2026-07-22T11:00:00.000Z"));
      await expect(
        createExecutor("agent-run-2")({
          ...privateRequest,
          toolCallId: "provider-call-2",
        })
      ).resolves.toEqual({
        status: "reused",
        output: { recordId: "record-1", privateValue: "model-visible" },
      });
    } finally {
      vi.useRealTimers();
    }

    expect(execute).toHaveBeenCalledTimes(1);
    expect(persistence.invocations).toEqual([
      expect.objectContaining({
        input: { privateValue: "[REDACTED]" },
        output: { recordId: "record-1", privateValue: "[REDACTED]" },
        approvalState: "pending",
        reused: false,
      }),
      expect.objectContaining({
        input: { privateValue: "[REDACTED]" },
        output: { recordId: "record-1", privateValue: "[REDACTED]" },
        approvalState: "pending",
        reused: true,
        startedAt: new Date("2026-07-22T11:00:00.000Z"),
        completedAt: new Date("2026-07-22T11:00:00.000Z"),
        durationMs: 0,
      }),
    ]);
  });

  it("recovers a failed execution on the next provider call without duplicating the committed side effect", async () => {
    const persistence = createStore();
    const execute = vi
      .fn()
      .mockRejectedValueOnce(new Error("domain command rejected"))
      .mockImplementationOnce(
        async (_context: unknown, _input: unknown, transaction?: unknown) => {
          (transaction as TestDatabaseTransaction).records.push("record-1");
          return { recordId: "record-1" };
        }
      );
    const executeToolCall = createSideEffectingExecutor(persistence.store, {
      execute,
    }).executeToolCall;

    await expect(executeToolCall(request)).resolves.toEqual({
      status: "failed",
      failureCode: "TOOL_EXECUTION_FAILED",
    });
    await expect(executeToolCall(request)).resolves.toEqual({
      status: "completed",
      output: { recordId: "record-1" },
    });

    expect(execute).toHaveBeenCalledTimes(2);
    expect(persistence.records).toEqual(["record-1"]);
    expect(persistence.invocations).toEqual([
      expect.objectContaining({
        failureCode: null,
        output: { recordId: "record-1" },
      }),
    ]);
  });

  it("keeps provider provenance separate from canonical execution identity", async () => {
    const persistence = createStore();
    const { execute, executeToolCall } = createSideEffectingExecutor(
      persistence.store
    );

    await expect(
      Promise.all([
        executeToolCall(request),
        executeToolCall({
          ...request,
          idempotencyKey: "idempotency-2",
          input: { value: "different" },
        }),
      ])
    ).resolves.toEqual([
      expect.objectContaining({ status: "completed" }),
      expect.objectContaining({ status: "completed" }),
    ]);

    expect(execute).toHaveBeenCalledTimes(2);
    expect(persistence.records).toEqual(["record-1", "record-1"]);
    expect(persistence.invocations).toHaveLength(2);
  });

  it.each([
    {
      expected: "TOOL_INPUT_INVALID",
      expectedInput: "[REDACTED:INVALID_OR_UNAUTHORIZED_TOOL_INPUT]",
      input: { unexpected: true },
      authorize: async (): Promise<boolean> => true,
      execute: async () => ({ recordId: "record-1" }),
    },
    {
      expected: "TOOL_OWNERSHIP_DENIED",
      expectedInput: "[REDACTED:INVALID_OR_UNAUTHORIZED_TOOL_INPUT]",
      input: {},
      authorize: async (): Promise<boolean> => false,
      execute: async () => ({ recordId: "record-1" }),
    },
    {
      expected: "TOOL_EXECUTION_FAILED",
      expectedInput: {},
      input: {},
      authorize: async (): Promise<boolean> => true,
      execute: async () => {
        throw new Error("domain command failed");
      },
    },
    {
      expected: "TOOL_PERSISTENCE_FAILED",
      expectedInput: {},
      input: {},
      authorize: async (): Promise<boolean> => true,
      execute: async () => {
        throw Object.assign(new Error("database connection failed"), {
          code: "08006",
        });
      },
    },
  ])("persists the safe $expected failure classification", async (scenario) => {
    const persistence = createStore();
    const registry = createToolRegistry([
      {
        name: "side_effecting_tool",
        description: "Persist one domain record.",
        inputSchema: z.object({}).strict(),
        outputSchema: z.object({ recordId: z.string() }),
        ownership: "current_user",
        risk: "medium",
        approval: "not_required",
        execution: "database_transaction",
        authorize: scenario.authorize,
        execute: scenario.execute,
      },
    ]);
    const executeToolCall = createDurableToolCallExecutor({
      registry,
      store: persistence.store,
      context: { userId: "user-1", currentPageId: "page-1" },
      allowedTools: ["side_effecting_tool"],
      provenance: {
        sourceRunId: "source-run-1",
        agentRunId: "agent-run-1",
        idempotencyScopeId: "retry-root-1",
      },
    });

    await expect(
      executeToolCall({ ...request, input: scenario.input })
    ).resolves.toEqual({
      status: "failed",
      failureCode: scenario.expected,
    });
    expect(persistence.invocations).toEqual([
      expect.objectContaining({
        input: scenario.expectedInput,
        failureCode: scenario.expected,
      }),
    ]);
  });
});
