import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => {
  const state = {
    selects: [] as unknown[][],
    writes: [] as unknown[],
  };
  const select = () => {
    const rows = state.selects.shift() ?? [];
    const query = {
      from: () => query,
      innerJoin: () => query,
      where: () => query,
      limit: () => Promise.resolve(rows),
    };
    return query;
  };
  const insert = () => {
    const query = {
      values: (value: unknown) => {
        state.writes.push(value);
        return query;
      },
      onConflictDoUpdate: () => query,
      returning: () => Promise.resolve([state.writes.at(-1)]),
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

import {
  loadActivePersonalInstructions,
  setActivePersonalInstructions,
} from "../server";

describe("active personal Instructions lifecycle", () => {
  beforeEach(() => {
    database.state.selects = [];
    database.state.writes = [];
  });

  it("atomically replaces the one active Page without changing either Page", async () => {
    database.state.selects.push([{ id: "page-2" }]);

    await setActivePersonalInstructions("user-1", "page-2");

    expect(database.state.writes).toHaveLength(1);
    expect(database.state.writes[0]).toMatchObject({
      userId: "user-1",
      activePageId: "page-2",
    });
  });

  it("falls back safely when the selected Page is missing or deleted", async () => {
    database.state.selects.push([]);
    await expect(loadActivePersonalInstructions("user-1")).resolves.toBeNull();
  });
});
