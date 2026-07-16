import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => {
  const state = {
    selects: [] as unknown[][],
    inserts: [] as unknown[][],
    insertValues: [] as unknown[],
  };
  const select = () => {
    const rows = state.selects.shift() ?? [];
    const query = {
      from: () => query,
      innerJoin: () => query,
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
  const connection = { select, insert };
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

import { createAgentDocumentProposal } from "../index";

const content = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      attrs: { blockId: "block-1" },
      content: [{ type: "text", text: "I has a plan." }],
    },
  ],
};
const input = {
  userId: "user-1",
  pageId: "page-1",
  sourceRunId: "source-run-1",
  agentRunId: "agent-run-1",
  providerToolCallId: "provider-call-1",
  toolCallIdempotencyKey: "key-1",
  idempotencyScopeId: "agent-run-1",
  summary: "Improve the opening sentence.",
  operations: {
    baseContentRevision: 4,
    operations: [
      {
        type: "replace-text" as const,
        target: {
          blockId: "block-1",
          expectedText: "I has a plan.",
          from: 2,
          to: 5,
        },
        text: "have",
      },
    ],
  },
};

describe("Agent DocumentProposal persistence", () => {
  beforeEach(() => {
    database.state.selects = [];
    database.state.inserts = [];
    database.state.insertValues = [];
  });

  it("persists a pending proposal with complete Agent and Tool provenance without applying content", async () => {
    const proposal = {
      id: "proposal-1",
      pageId: "page-1",
      baseContentRevision: 4,
      status: "pending",
    };
    database.state.selects.push(
      [],
      [{ page: { id: "page-1", contentRevision: 4, content } }]
    );
    database.state.inserts.push([proposal]);

    await expect(createAgentDocumentProposal(input)).resolves.toEqual({
      proposalId: "proposal-1",
      pageId: "page-1",
      baseContentRevision: 4,
      status: "pending",
    });
    expect(database.state.insertValues[0]).toMatchObject({
      sourceRunId: "source-run-1",
      agentRunId: "agent-run-1",
      providerToolCallId: "provider-call-1",
      toolCallIdempotencyKey: "key-1",
      idempotencyScopeId: "agent-run-1",
      operations: input.operations,
    });
  });

  it("does not persist invalid or stale operation batches", async () => {
    database.state.selects.push(
      [],
      [{ page: { id: "page-1", contentRevision: 4, content } }]
    );

    await expect(
      createAgentDocumentProposal({
        ...input,
        operations: {
          ...input.operations,
          operations: [
            {
              ...input.operations.operations[0],
              target: {
                ...input.operations.operations[0].target,
                expectedText: "Changed text",
              },
            },
          ],
        },
      })
    ).rejects.toMatchObject({ code: "INVALID_AGENT_DOCUMENT_OPERATIONS" });
    expect(database.state.insertValues).toHaveLength(0);
  });

  it("returns the original proposal for the same retry-lineage idempotency key", async () => {
    database.state.selects.push([
      {
        id: "proposal-1",
        pageId: "page-1",
        creatorId: "user-1",
        baseContentRevision: 4,
        status: "pending",
      },
    ]);

    await expect(createAgentDocumentProposal(input)).resolves.toMatchObject({
      proposalId: "proposal-1",
      status: "pending",
    });
    expect(database.state.insertValues).toHaveLength(0);
  });
});
