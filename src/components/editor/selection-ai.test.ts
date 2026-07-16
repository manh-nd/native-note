import { describe, expect, it } from "vitest";
import { Editor, type JSONContent } from "@tiptap/core";
import { addBlockIds, identityExtensions } from "./extensions";
import {
  SelectionAiPreview,
  applySelectionAiResult,
  buildPlainTextIndex,
  selectionSegments,
  selectionSourcesForOperations,
  selectionSourcesForStaleOperations,
  selectionWordDiff,
  showDocumentProposalPreview,
  type SelectionAiSegment,
} from "./selection-ai";

function makeEditor(content: JSONContent) {
  return new Editor({
    content: addBlockIds(content),
    extensions: [...identityExtensions, SelectionAiPreview],
  });
}

function aiResult(id: string, result: string): SelectionAiSegment {
  return {
    id,
    result,
    category: "naturalness",
    explanationVi: "Tự nhiên hơn",
    exampleEn: result,
    register: "neutral",
    confidence: 0.9,
  };
}

describe("canonical plain-text index", () => {
  it("maps paragraphs, nested list text, duplicate text, and Unicode without ambiguous search", () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Same 😀" }] },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "First" }],
                },
                {
                  type: "bulletList",
                  content: [
                    {
                      type: "listItem",
                      content: [
                        {
                          type: "paragraph",
                          content: [{ type: "text", text: "Nested" }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Same 😀" }],
        },
      ],
    });
    const index = buildPlainTextIndex(editor.state.doc);
    expect(index.text).toBe("Same 😀\nFirst\nNested\nSame 😀");
    expect(
      index.blocks.map((block) =>
        index.text.slice(block.plainFrom, block.plainTo)
      )
    ).toEqual(["Same 😀", "First", "Nested", "Same 😀"]);
    expect(index.blocks[0].plainFrom).not.toBe(index.blocks[3].plainFrom);
    editor.destroy();
  });

  it("splits a partial multi-block selection and retains block IDs", () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Heading" }],
        },
        { type: "paragraph", content: [{ type: "text", text: "Paragraph" }] },
        {
          type: "blockquote",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Quote" }] },
          ],
        },
      ],
    });
    const index = buildPlainTextIndex(editor.state.doc);
    editor.commands.setTextSelection({
      from: index.blocks[0].pmFrom + 2,
      to: index.blocks[2].pmFrom + 3,
    });
    const segments = selectionSegments(editor);
    expect(segments.map((segment) => segment.text)).toEqual([
      "ading",
      "Paragraph",
      "Quo",
    ]);
    expect(segments.every((segment) => Boolean(segment.blockId))).toBe(true);
    expect(segments.map((segment) => segment.nodeType)).toEqual([
      "heading",
      "paragraph",
      "paragraph",
    ]);
    editor.destroy();
  });
});

describe("selection diff and apply", () => {
  it("previews every Agent document operation as an editor decoration", () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { blockId: "replace" },
          content: [{ type: "text", text: "Old text" }],
        },
        {
          type: "paragraph",
          attrs: { blockId: "insert" },
          content: [{ type: "text", text: "Insert after me" }],
        },
        {
          type: "heading",
          attrs: { blockId: "attributes", level: 2 },
          content: [{ type: "text", text: "Heading" }],
        },
        {
          type: "paragraph",
          attrs: { blockId: "delete" },
          content: [{ type: "text", text: "Delete me" }],
        },
      ],
    });

    expect(
      showDocumentProposalPreview(editor, {
        baseContentRevision: 1,
        operations: [
          {
            type: "replace-text",
            target: {
              blockId: "replace",
              expectedText: "Old text",
              from: 0,
              to: 3,
            },
            text: "New",
          },
          {
            type: "insert-blocks-after",
            target: { blockId: "insert", expectedText: "Insert after me" },
            blocks: [
              {
                type: "paragraph",
                attrs: { blockId: "inserted" },
                content: [{ type: "text", text: "Inserted block" }],
              },
            ],
          },
          {
            type: "set-block-attributes",
            target: { blockId: "attributes", expectedText: "Heading" },
            attributes: { level: 3 },
          },
          {
            type: "delete-block",
            target: { blockId: "delete", expectedText: "Delete me" },
          },
        ],
      })
    ).toBe(true);
    expect(
      editor.view.dom.querySelector(".selection-ai-addition")?.textContent
    ).toContain("New");
    expect(editor.view.dom.textContent).toContain("Inserted block");
    expect(
      editor.view.dom.querySelector(".document-proposal-attribute-change")
    ).not.toBeNull();
    expect(
      editor.view.dom.querySelector('[data-blockid="delete"]')?.className
    ).toContain("selection-ai-removal");
    editor.destroy();
  });

  it("rebuilds a pending proposal preview from its stable block target after reload", () => {
    const editor = makeEditor({
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
    });
    const sources = selectionSourcesForOperations(editor, {
      baseContentRevision: 1,
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
    });

    expect(sources).toHaveLength(1);
    expect(sources?.[0]).toMatchObject({
      blockId: "second",
      text: "Same",
    });
    editor.destroy();
  });

  it("locates a stale proposal's current target by stable block ID for regeneration", () => {
    const editor = makeEditor({
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
          content: [{ type: "text", text: "Updated text" }],
        },
      ],
    });
    const sources = selectionSourcesForStaleOperations(editor, {
      baseContentRevision: 1,
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
    });

    expect(sources?.[0]).toMatchObject({
      blockId: "second",
      text: "Upda",
    });
    editor.destroy();
  });

  it("diffs whitespace, punctuation, and Unicode", () => {
    const parts = selectionWordDiff("Hello,  thế giới!", "Hi, thế giới 😀!");
    expect(parts.some((part) => part.removed)).toBe(true);
    expect(parts.some((part) => part.added)).toBe(true);
    expect(parts.map((part) => part.value).join("")).toContain("😀");
  });

  it("applies multiple segments in one undoable transaction while preserving block structure", () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Old heading" }],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Old item" }],
                },
              ],
            },
          ],
        },
        {
          type: "blockquote",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Old quote" }],
            },
          ],
        },
      ],
    });
    const index = buildPlainTextIndex(editor.state.doc);
    editor.commands.setTextSelection({
      from: index.blocks[0].pmFrom,
      to: index.blocks[2].pmTo,
    });
    const sources = selectionSegments(editor);
    const results = sources.map((source, index) =>
      aiResult(source.id, ["New heading", "New item", "New quote"][index])
    );
    expect(applySelectionAiResult(editor, sources, results)).toBe(true);
    expect(editor.state.doc.child(0).type.name).toBe("heading");
    expect(editor.state.doc.child(1).type.name).toBe("bulletList");
    expect(editor.state.doc.child(2).type.name).toBe("blockquote");
    expect(buildPlainTextIndex(editor.state.doc).text).toBe(
      "New heading\nNew item\nNew quote"
    );
    expect(editor.commands.undo()).toBe(true);
    expect(buildPlainTextIndex(editor.state.doc).text).toBe(
      "Old heading\nOld item\nOld quote"
    );
    editor.destroy();
  });
});
