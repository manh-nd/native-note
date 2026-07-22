import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => {
  const state = {
    selects: [] as unknown[][],
    inserts: [] as unknown[][],
    insertValues: [] as unknown[],
    leftJoins: [] as Array<{ on: unknown }>,
    updates: [] as unknown[][],
    updateValues: [] as unknown[],
  };
  const select = () => {
    const rows = state.selects.shift() ?? [];
    const query = {
      from: () => query,
      innerJoin: () => query,
      leftJoin: (_table: unknown, on: unknown) => {
        state.leftJoins.push({ on });
        return query;
      },
      where: () => query,
      for: () => query,
      limit: () => Promise.resolve(rows),
    };
    return query;
  };
  const insert = () => {
    const rows = state.inserts.shift() ?? [];
    const query = {
      values: (value: unknown) => {
        state.insertValues.push(value);
        return query;
      },
      onConflictDoNothing: () => query,
      returning: () => Promise.resolve(rows),
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
      then: (resolve: (value: unknown[]) => unknown) =>
        Promise.resolve(rows).then(resolve),
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
      public code: string
    ) {
      super(message);
    }
  },
}));

import {
  createAgentLearningItemRecommendation,
  decideAgentLearningItemRecommendation,
} from "../learning-items";

const input = {
  userId: "user-1",
  pageId: "page-1",
  sourceRunId: "source-run-1",
  agentRunId: "agent-run-1",
  providerToolCallId: "provider-call-1",
  toolCallIdempotencyKey: "key-1",
  idempotencyScopeId: "agent-run-1",
  category: "grammar" as const,
  originalPattern: "I has",
  targetExpression: "I have",
  explanation: "Use have with I.",
  sourceEvidence: "I has a plan.",
};

function sqlColumnNames(value: unknown) {
  const names: string[] = [];
  const visit = (chunk: unknown) => {
    if (!chunk || typeof chunk !== "object") return;
    if ("name" in chunk && "table" in chunk && typeof chunk.name === "string") {
      names.push(chunk.name);
      return;
    }
    if (Array.isArray(chunk)) {
      chunk.forEach(visit);
      return;
    }
    if ("queryChunks" in chunk) visit(chunk.queryChunks);
  };
  visit(value);
  return names;
}

describe("Agent LearningItem recommendations", () => {
  beforeEach(() => {
    database.state.selects = [];
    database.state.inserts = [];
    database.state.insertValues = [];
    database.state.leftJoins = [];
    database.state.updates = [];
    database.state.updateValues = [];
  });

  it("persists a pending recommendation with AgentRun and ToolCall provenance", async () => {
    database.state.selects.push([], [{ id: "agent-run-1" }]);
    database.state.inserts.push([
      { id: "recommendation-1", status: "pending" },
    ]);

    await expect(createAgentLearningItemRecommendation(input)).resolves.toEqual(
      {
        recommendationId: "recommendation-1",
        status: "pending",
      }
    );
    expect(database.state.insertValues[0]).toMatchObject({
      userId: "user-1",
      pageId: "page-1",
      sourceRunId: "source-run-1",
      agentRunId: "agent-run-1",
      providerToolCallId: "provider-call-1",
      toolCallIdempotencyKey: "key-1",
      idempotencyScopeId: "agent-run-1",
      category: "grammar",
      originalPattern: "I has",
      targetExpression: "I have",
      explanation: "Use have with I.",
      sourceEvidence: "I has a plan.",
      status: "pending",
    });
  });

  it("returns the original recommendation for the same retry-lineage idempotency key", async () => {
    database.state.selects.push([
      {
        id: "recommendation-1",
        userId: "user-1",
        pageId: "page-1",
        status: "pending",
      },
    ]);

    await expect(createAgentLearningItemRecommendation(input)).resolves.toEqual(
      {
        recommendationId: "recommendation-1",
        status: "pending",
      }
    );
    expect(database.state.insertValues).toHaveLength(0);
  });

  it("returns the concurrent winner instead of duplicating a recommendation", async () => {
    database.state.selects.push(
      [],
      [{ id: "agent-run-1" }],
      [
        {
          id: "recommendation-1",
          userId: "user-1",
          pageId: "page-1",
          status: "pending",
        },
      ]
    );
    database.state.inserts.push([]);

    await expect(createAgentLearningItemRecommendation(input)).resolves.toEqual(
      {
        recommendationId: "recommendation-1",
        status: "pending",
      }
    );
    expect(database.state.insertValues).toHaveLength(1);
  });

  it("approves an owned recommendation and updates both ToolCall audit records", async () => {
    database.state.selects.push([
      {
        recommendation: {
          id: "recommendation-1",
          userId: "user-1",
          agentRunId: "agent-run-1",
          providerToolCallId: "provider-call-1",
          category: "grammar",
          originalPattern: "I has",
          targetExpression: "I have",
          explanation: "Use have with I.",
          sourceEvidence: "I has a plan.",
          status: "pending",
        },
        learningItemId: null,
        toolCallExecutionId: "execution-1",
      },
    ]);
    database.state.inserts.push([{ id: "learning-item-1" }]);
    database.state.updates.push([], []);

    await expect(
      decideAgentLearningItemRecommendation({
        userId: "user-1",
        recommendationId: "recommendation-1",
        decision: "approve",
      })
    ).resolves.toEqual({
      recommendationId: "recommendation-1",
      status: "approved",
      learningItemId: "learning-item-1",
    });
    expect(database.state.insertValues[0]).toMatchObject({
      userId: "user-1",
      agentRecommendationId: "recommendation-1",
      findingId: null,
      category: "grammar",
      originalPattern: "I has",
      targetExpression: "I have",
      explanationVi: "Use have with I.",
      sourceContext: "I has a plan.",
      status: "active",
    });
    expect(database.state.updateValues).toEqual([
      expect.objectContaining({ status: "approved" }),
      { approvalState: "approved" },
      { approvalState: "approved" },
    ]);
    expect(sqlColumnNames(database.state.leftJoins[1]?.on)).toContain(
      "idempotency_key"
    );
  });

  it("rejects idempotently and updates both ToolCall audit records", async () => {
    const pending = {
      recommendation: {
        id: "recommendation-1",
        userId: "user-1",
        agentRunId: "agent-run-1",
        providerToolCallId: "provider-call-1",
        status: "pending",
      },
      learningItemId: null,
      toolCallExecutionId: "execution-1",
    };
    const rejected = {
      recommendation: { ...pending.recommendation, status: "rejected" },
      learningItemId: null,
    };
    database.state.selects.push([pending], [rejected]);
    database.state.updates.push([], []);

    const decide = () =>
      decideAgentLearningItemRecommendation({
        userId: "user-1",
        recommendationId: "recommendation-1",
        decision: "reject",
      });
    await expect(decide()).resolves.toEqual({
      recommendationId: "recommendation-1",
      status: "rejected",
      learningItemId: null,
    });
    await expect(decide()).resolves.toEqual({
      recommendationId: "recommendation-1",
      status: "rejected",
      learningItemId: null,
    });
    expect(database.state.insertValues).toHaveLength(0);
    expect(database.state.updateValues).toEqual([
      expect.objectContaining({ status: "rejected" }),
      { approvalState: "denied" },
      { approvalState: "denied" },
    ]);
  });

  it("returns the same LearningItem for repeated approvals", async () => {
    database.state.selects.push([
      {
        recommendation: {
          id: "recommendation-1",
          userId: "user-1",
          status: "approved",
        },
        learningItemId: "learning-item-1",
      },
    ]);

    await expect(
      decideAgentLearningItemRecommendation({
        userId: "user-1",
        recommendationId: "recommendation-1",
        decision: "approve",
      })
    ).resolves.toEqual({
      recommendationId: "recommendation-1",
      status: "approved",
      learningItemId: "learning-item-1",
    });
    expect(database.state.insertValues).toHaveLength(0);
    expect(database.state.updateValues).toHaveLength(0);
  });

  it("does not expose or decide another user's recommendation", async () => {
    database.state.selects.push([]);

    await expect(
      decideAgentLearningItemRecommendation({
        userId: "other-user",
        recommendationId: "recommendation-1",
        decision: "approve",
      })
    ).rejects.toMatchObject({ code: "LEARNING_RECOMMENDATION_NOT_FOUND" });
    expect(database.state.insertValues).toHaveLength(0);
    expect(database.state.updateValues).toHaveLength(0);
  });
});
