import { describe, expect, it, vi } from "vitest";
import { applyDocumentOperations } from "@/packages/document-editor";

vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {},
}));

import {
  createBlockDocumentProposalOperations,
  isDocumentProposalStale,
} from "../index";

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
  it("builds a stable block replacement or validated insertion without creating learning data", () => {
    const replacement = createBlockDocumentProposalOperations({
      content,
      contentRevision: 3,
      blockId: "second",
      expectedText: "Same text",
      result: "That text",
      behavior: "replace",
    });
    const insertion = createBlockDocumentProposalOperations({
      content,
      contentRevision: 3,
      blockId: "second",
      expectedText: "Same text",
      result: "That text\n\nAnother paragraph",
      behavior: "insert",
    });

    expect(replacement).toEqual({
      baseContentRevision: 3,
      operations: [
        {
          type: "replace-text",
          target: {
            blockId: "second",
            expectedText: "Same text",
            from: 0,
            to: 9,
          },
          text: "That text",
        },
      ],
    });
    expect(insertion.operations[0]).toMatchObject({
      type: "insert-blocks-after",
      target: { blockId: "second", expectedText: "Same text" },
      blocks: [
        { type: "paragraph", content: [{ type: "text", text: "That text" }] },
        { type: "paragraph", content: [{ type: "text", text: "Another paragraph" }] },
      ],
    });
    expect(insertion.operations[0]).toHaveProperty("blocks.0.attrs.blockId");
    expect(insertion.operations[0]).toHaveProperty("blocks.1.attrs.blockId");
    expect(
      applyDocumentOperations({
        content,
        contentRevision: 3,
        batch: insertion,
      }).plainText
    ).toBe("Same text\nSame text\nThat text\nAnother paragraph");
  });

  it("rejects a block proposal when the stable target no longer has its expected text", () => {
    expect(() =>
      createBlockDocumentProposalOperations({
        content,
        contentRevision: 3,
        blockId: "second",
        expectedText: "Changed text",
        result: "That text",
        behavior: "replace",
      })
    ).toThrow();
  });

  it("inserts validated list items without flattening the target list", () => {
    const listContent = {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              attrs: { blockId: "item" },
              content: [
                {
                  type: "paragraph",
                  attrs: { blockId: "item-text" },
                  content: [{ type: "text", text: "First" }],
                },
              ],
            },
          ],
        },
      ],
    };
    const batch = createBlockDocumentProposalOperations({
      content: listContent,
      contentRevision: 3,
      blockId: "item",
      expectedText: "First",
      result: "Inserted",
      behavior: "insert",
    });
    const applied = applyDocumentOperations({
      content: listContent,
      contentRevision: 3,
      batch,
    });

    expect(applied.plainText).toBe("First\nInserted");
    expect(applied.content.content?.[0]).toMatchObject({
      type: "bulletList",
      content: [
        { type: "listItem", attrs: { blockId: "item" } },
        { type: "listItem" },
      ],
    });
  });

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
