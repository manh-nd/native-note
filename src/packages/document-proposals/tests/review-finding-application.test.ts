import { describe, expect, it, vi } from "vitest";
import { applyDocumentOperations } from "@/packages/document-editor";

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
  createReviewFindingDecisionBatch,
  type ReviewFindingDecisionTarget,
} from "../index";

function content(blocks: Array<{ blockId: string; text: string }>) {
  return {
    type: "doc",
    content: blocks.map(({ blockId, text }) => ({
      type: "paragraph",
      attrs: { blockId },
      content: [{ type: "text", text }],
    })),
  };
}

function target(
  input: Partial<ReviewFindingDecisionTarget> &
    Pick<ReviewFindingDecisionTarget, "findingId" | "blockId">
): ReviewFindingDecisionTarget {
  return {
    expectedText: "A bad B bad C",
    from: 2,
    to: 5,
    original: "bad",
    suggestion: "excellent",
    ...input,
  };
}

describe("Review Finding application batches", () => {
  it("applies selected same-block Findings from right to left", () => {
    const document = content([{ blockId: "block-a", text: "A bad B bad C" }]);
    const batch = createReviewFindingDecisionBatch({
      content: document,
      contentRevision: 7,
      targets: [
        target({ findingId: "finding-a", blockId: "block-a" }),
        target({
          findingId: "finding-b",
          blockId: "block-a",
          from: 8,
          to: 11,
          suggestion: "good",
        }),
      ],
    });

    expect(
      batch.operations.map((operation) =>
        operation.type === "replace-text" ? operation.target.from : null
      )
    ).toEqual([8, 2]);
    expect(
      applyDocumentOperations({
        content: document,
        contentRevision: 7,
        batch,
      }).plainText
    ).toBe("A excellent B good C");
  });

  it("remaps a Finding when text outside its target changed", () => {
    const batch = createReviewFindingDecisionBatch({
      content: content([{ blockId: "block-a", text: "Longer A bad B bad C" }]),
      contentRevision: 8,
      targets: [target({ findingId: "finding-a", blockId: "block-a" })],
    });

    expect(batch.operations[0]).toMatchObject({
      target: { blockId: "block-a", from: 9, to: 12 },
      text: "excellent",
    });
  });

  it("keeps an unrelated block applicable after another target becomes stale", () => {
    const document = content([
      { blockId: "block-a", text: "A changed B bad C" },
      { blockId: "block-b", text: "A bad B bad C" },
    ]);
    const stale = target({ findingId: "finding-a", blockId: "block-a" });
    const current = target({ findingId: "finding-b", blockId: "block-b" });

    expect(() =>
      createReviewFindingDecisionBatch({
        content: document,
        contentRevision: 9,
        targets: [stale],
      })
    ).toThrow();
    expect(() =>
      createReviewFindingDecisionBatch({
        content: document,
        contentRevision: 9,
        targets: [current],
      })
    ).not.toThrow();
  });
});
