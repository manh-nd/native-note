import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => {
  const values: unknown[] = [];
  const query = {
    values: (value: unknown) => {
      values.push(value);
      return query;
    },
    returning: () => Promise.resolve([{ id: "run-1" }]),
  };
  return { values, db: { insert: () => query } };
});

vi.mock("@/db", () => ({ db: database.db }));
vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {},
}));

import { recordReadOnlyAiAction } from "@/packages/document-proposals";

describe("AI run Instructions audit", () => {
  beforeEach(() => {
    database.values.length = 0;
  });

  it("records the Instructions Page, content revision, and immutable snapshot", async () => {
    await recordReadOnlyAiAction({
      page: { id: "page-1", contentRevision: 4 } as never,
      userId: "user-1",
      sourceKind: "block",
      action: "explain",
      model: "model-1",
      inputSnapshot: "Input",
      outputSnapshot: { explanationVi: "Explanation" },
      instructions: {
        pageId: "instructions-page-1",
        contentRevision: 9,
        snapshot: "Use British spelling.",
      },
      status: "failed",
    });

    expect(database.values[0]).toMatchObject({
      instructionsPageId: "instructions-page-1",
      instructionsContentRevision: 9,
      instructionsSnapshot: "Use British spelling.",
      status: "failed",
    });
  });
});
