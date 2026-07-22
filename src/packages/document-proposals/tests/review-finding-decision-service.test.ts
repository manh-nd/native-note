import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => {
  const state = {
    selects: [] as unknown[][],
    updateResults: [] as unknown[][],
    insertResults: [] as unknown[][],
    updateValues: [] as Array<Record<string, unknown>>,
    insertValues: [] as unknown[],
  };
  const select = () => {
    const rows = state.selects.shift() ?? [];
    const query = {
      from: () => query,
      innerJoin: () => query,
      leftJoin: () => query,
      where: () => query,
      orderBy: () => query,
      for: () => query,
      limit: () => Promise.resolve(rows),
      then: <TResult1 = unknown[]>(
        onfulfilled?:
          ((value: unknown[]) => TResult1 | PromiseLike<TResult1>) | null
      ) => Promise.resolve(rows).then(onfulfilled),
    };
    return query;
  };
  const update = () => {
    const query = {
      set: (values: Record<string, unknown>) => {
        state.updateValues.push(values);
        return query;
      },
      where: () => query,
      returning: () => Promise.resolve(state.updateResults.shift() ?? []),
    };
    return query;
  };
  const insert = () => {
    const query = {
      values: (values: unknown) => {
        state.insertValues.push(values);
        return query;
      },
      onConflictDoNothing: () => Promise.resolve(),
      returning: () => Promise.resolve(state.insertResults.shift() ?? []),
    };
    return query;
  };
  const connection = { select, update, insert };
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
  applyReviewFindings,
  createLearningItemFromFinding,
  createReviewDocumentProposals,
} from "../index";

const document = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      attrs: { blockId: "block-a" },
      content: [{ type: "text", text: "A bad sentence" }],
    },
  ],
};

function finding(id: string, status = "pending") {
  return {
    id,
    status,
    suggestion: "good",
    original: "bad",
    category: "grammar",
    explanationVi: "explanation",
  };
}

function proposal(id: string, status = "pending") {
  return {
    id,
    status,
    operations: {
      baseContentRevision: 3,
      operations: [
        {
          type: "replace-text" as const,
          target: {
            blockId: "block-a",
            expectedText: "A bad sentence",
            from: 2,
            to: 5,
          },
          text: "good",
        },
      ],
    },
  };
}

describe("Review Finding decision service", () => {
  beforeEach(() => {
    database.state.selects = [];
    database.state.updateResults = [];
    database.state.insertResults = [];
    database.state.updateValues = [];
    database.state.insertValues = [];
  });

  it("applies and learns from exactly the selected Finding", async () => {
    const findingA = finding("finding-a");
    const page = { id: "page-1", contentRevision: 3, content: document };
    database.state.selects.push([
      {
        finding: findingA,
        proposal: proposal("proposal-a"),
        review: { snapshot: "A bad sentence" },
        page,
      },
    ]);
    database.state.updateResults.push(
      [{ ...page, contentRevision: 4 }],
      [{ ...findingA, status: "applied" }]
    );

    const result = await applyReviewFindings("user-1", [findingA.id]);

    expect(result.findingIds).toEqual([findingA.id]);
    expect(result.findings).toEqual([
      expect.objectContaining({ id: findingA.id, status: "applied" }),
    ]);
    expect(database.state.insertValues).toEqual([
      [expect.objectContaining({ findingId: findingA.id })],
    ]);
  });

  it("persists one proposal for each changed Finding", async () => {
    const page = { id: "page-1", contentRevision: 3, content: document };
    database.state.selects.push([page]);
    database.state.insertResults.push(
      [{ id: "run-1" }],
      [{ id: "review-1" }],
      [{ id: "proposal-a" }],
      [{ id: "finding-a", proposalId: "proposal-a" }],
      [{ id: "proposal-b" }],
      [{ id: "finding-b", proposalId: "proposal-b" }]
    );

    const stored = await createReviewDocumentProposals({
      page: page as never,
      userId: "user-1",
      model: "test-model",
      snapshot: "A bad sentence",
      findings: [
        {
          blockId: "block-a",
          category: "grammar",
          original: "bad",
          suggestion: "good",
          explanationVi: "first",
          exampleEn: "example",
          register: "neutral",
          confidence: 0.9,
          from: 2,
          to: 5,
        },
        {
          blockId: "block-a",
          category: "clarity",
          original: "sentence",
          suggestion: "phrase",
          explanationVi: "second",
          exampleEn: "example",
          register: "neutral",
          confidence: 0.8,
          from: 6,
          to: 14,
        },
      ],
    });

    expect(stored).toEqual([
      expect.objectContaining({ proposalId: "proposal-a" }),
      expect.objectContaining({ proposalId: "proposal-b" }),
    ]);
    expect(database.state.insertValues[2]).toMatchObject({
      operations: { operations: [{ text: "good" }] },
    });
    expect(database.state.insertValues[4]).toMatchObject({
      operations: { operations: [{ text: "phrase" }] },
    });
  });

  it("treats a repeated apply as idempotent without writing again", async () => {
    const applied = finding("finding-a", "applied");
    database.state.selects.push([
      {
        finding: applied,
        proposal: proposal("proposal-a", "accepted"),
        review: { snapshot: "A bad sentence" },
        page: { id: "page-1", contentRevision: 4, content: document },
      },
    ]);

    const result = await applyReviewFindings("user-1", [applied.id]);

    expect(result.idempotent).toBe(true);
    expect(database.state.updateValues).toEqual([]);
    expect(database.state.insertValues).toEqual([]);
  });

  it("marks only the selected stale Finding", async () => {
    const findingA = finding("finding-a");
    database.state.selects.push([
      {
        finding: findingA,
        proposal: proposal("proposal-a"),
        review: { snapshot: "A bad sentence" },
        page: {
          id: "page-1",
          contentRevision: 4,
          content: {
            ...document,
            content: [
              {
                type: "paragraph",
                attrs: { blockId: "block-a" },
                content: [{ type: "text", text: "A changed sentence" }],
              },
            ],
          },
        },
      },
    ]);

    await expect(
      applyReviewFindings("user-1", [findingA.id])
    ).rejects.toMatchObject({ code: "STALE_FINDING" });
    expect(database.state.updateValues).toEqual([{ status: "stale" }]);
  });

  it("saves and learns from one Finding without dismissing siblings", async () => {
    const findingA = finding("finding-a");
    const findingProposal = proposal("proposal-a");
    database.state.selects.push([
      {
        finding: findingA,
        proposal: findingProposal,
        review: { snapshot: "A bad sentence" },
      },
    ]);
    database.state.updateResults.push(
      [{ ...findingA, status: "saved" }],
      [{ ...findingProposal, status: "rejected" }]
    );

    const result = await createLearningItemFromFinding("user-1", findingA.id);

    expect(result.findingIds).toEqual([findingA.id]);
    expect(database.state.updateValues).not.toContainEqual({
      status: "dismissed",
    });
    expect(database.state.insertValues).toEqual([
      expect.objectContaining({ findingId: findingA.id }),
    ]);
  });
});
