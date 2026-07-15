import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {},
}));

import { isDocumentProposalStale } from "../index";

const content = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      attrs: { blockId: "first" },
      content: [{ type: "text", text: "Same text" }],
    },
    {
      type: "paragraph",
      attrs: { blockId: "second" },
      content: [{ type: "text", text: "Same text" }],
    },
  ],
};

describe("DocumentProposal lifecycle", () => {
  it("keeps a proposal current when its stable target identifies one of repeated texts", () => {
    expect(
      isDocumentProposalStale({
        content,
        contentRevision: 3,
        proposal: {
          baseContentRevision: 3,
          operations: {
            baseContentRevision: 3,
            operations: [
              {
                type: "replace-text",
                target: {
                  blockId: "second",
                  expectedText: "Same text",
                  from: 0,
                  to: 4,
                },
                text: "That",
              },
            ],
          },
        },
      })
    ).toBe(false);
  });

  it("marks a proposal stale after its content revision or exact target changes", () => {
    const proposal = {
      baseContentRevision: 3,
      operations: {
        baseContentRevision: 3,
        operations: [
          {
            type: "replace-text" as const,
            target: {
              blockId: "second",
              expectedText: "Changed text",
              from: 0,
              to: 4,
            },
            text: "That",
          },
        ],
      },
    };

    expect(
      isDocumentProposalStale({ content, contentRevision: 3, proposal })
    ).toBe(true);
    expect(
      isDocumentProposalStale({
        content,
        contentRevision: 4,
        proposal: { ...proposal, baseContentRevision: 3 },
      })
    ).toBe(true);
  });
});
