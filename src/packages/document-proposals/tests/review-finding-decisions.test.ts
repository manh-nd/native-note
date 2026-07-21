import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => {
  const state = {
    selects: [] as unknown[][],
    updates: [] as unknown[][],
  };
  const select = () => {
    const rows = state.selects.shift() ?? [];
    const query = {
      from: () => query,
      innerJoin: () => query,
      leftJoin: () => query,
      where: () => query,
      for: () => query,
      limit: () => Promise.resolve(rows),
    };
    return query;
  };
  const update = () => {
    const rows = state.updates.shift() ?? [];
    const query = {
      set: () => query,
      where: () => query,
      returning: () => Promise.resolve(rows),
    };
    return query;
  };
  const connection = { select, update };
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

import { dismissReviewFinding } from "../index";

describe("Review Finding decisions", () => {
  beforeEach(() => {
    database.state.selects = [];
    database.state.updates = [];
  });

  it("dismisses one Finding without dismissing another Finding from the same Review", async () => {
    const findingA = { id: "finding-a", status: "pending" };
    const findingB = { id: "finding-b", status: "pending" };
    const proposal = { id: "proposal-1", status: "pending" };

    database.state.selects.push([
      { finding: findingA, proposal, review: { id: "review-1" } },
    ]);
    database.state.updates.push(
      [{ ...findingA, status: "dismissed" }],
      [{ ...proposal, status: "rejected" }],
      [{ id: findingB.id }]
    );

    const result = await dismissReviewFinding("user-1", findingA.id);

    expect(result.findingIds).toEqual([findingA.id]);
  });
});
