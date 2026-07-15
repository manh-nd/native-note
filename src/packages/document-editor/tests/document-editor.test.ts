import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import {
  applyDocumentOperations,
  applyDocumentOperationsToEditor,
  createDocumentEditorSession,
  createDocumentEditorExtensions,
  createPortableExcerpt,
  prepareDocumentContent,
  type DocumentOperationBatch,
} from "../index";

const source = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 2, blockId: "heading" },
      content: [
        { type: "text", text: "A " },
        { type: "text", marks: [{ type: "bold" }], text: "marked" },
        { type: "text", text: " heading" },
      ],
    },
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
              content: [{ type: "text", text: "Nested item" }],
            },
            {
              type: "bulletList",
              content: [
                {
                  type: "listItem",
                  attrs: { blockId: "child" },
                  content: [
                    {
                      type: "paragraph",
                      attrs: { blockId: "child-text" },
                      content: [{ type: "text", text: "Child" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

describe("document-editor public interface", () => {
  it("prepares portable excerpts with identities, attributes, and nesting paths", () => {
    const document = prepareDocumentContent(source);
    expect(createPortableExcerpt(document.content)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          blockId: "heading",
          type: "heading",
          text: "A marked heading",
          nestingPath: [],
        }),
        expect.objectContaining({
          blockId: "item",
          type: "listItem",
          text: "Nested item",
          nestingPath: ["bulletList"],
        }),
        expect.objectContaining({
          blockId: "child",
          type: "listItem",
          text: "Child",
          nestingPath: ["bulletList", "listItem", "bulletList"],
        }),
      ])
    );
  });

  it("applies the same atomic operation batch headlessly and in a live editor", () => {
    const batch: DocumentOperationBatch = {
      baseContentRevision: 7,
      operations: [
        {
          type: "replace-text",
          target: {
            blockId: "heading",
            expectedText: "A marked heading",
            from: 2,
            to: 8,
          },
          text: "bold",
        },
        {
          type: "replace-text",
          target: {
            blockId: "item",
            expectedText: "Nested item",
            from: 0,
            to: 6,
          },
          text: "Structured",
        },
        {
          type: "set-block-attributes",
          target: { blockId: "item", expectedText: "Structured item" },
          attributes: { blockColor: "blue" },
        },
        {
          type: "insert-blocks-after",
          target: { blockId: "heading", expectedText: "A bold heading" },
          blocks: [
            {
              type: "paragraph",
              attrs: { blockId: "inserted" },
              content: [{ type: "text", text: "Inserted" }],
            },
          ],
        },
      ],
    };
    const expected = applyDocumentOperations({
      content: source,
      contentRevision: 7,
      batch,
    });
    const editor = createDocumentEditorSession(source);
    expect(editor.apply(batch, 7).content).toEqual(expected.content);
    expect(editor.getText()).toBe(
      "A bold heading\nInserted\nStructured item\nChild"
    );
    expect(editor.undo()).toBe(true);
    expect(editor.getText()).toBe("A marked heading\nNested item\nChild");
    editor.destroy();
  });

  it("marks canonical live application as one undoable transaction", () => {
    const editor = new Editor({
      content: source,
      extensions: createDocumentEditorExtensions(),
    });
    const batch: DocumentOperationBatch = {
      baseContentRevision: 7,
      operations: [
        {
          type: "replace-text",
          target: {
            blockId: "heading",
            expectedText: "A marked heading",
            from: 0,
            to: 1,
          },
          text: "The",
        },
      ],
    };
    let origin: unknown;
    editor.on("transaction", ({ transaction }) => {
      origin = transaction.getMeta("documentOperationOrigin");
    });
    applyDocumentOperationsToEditor(
      editor,
      batch,
      7,
      "server-canonical-proposal"
    );
    expect(origin).toBe("server-canonical-proposal");
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getText()).toContain("A marked heading");
    editor.destroy();
  });

  it("rejects stale or invalid batches without changing the document", () => {
    const editor = createDocumentEditorSession(source);
    const before = editor.getContent();
    expect(() =>
      editor.apply(
        {
          baseContentRevision: 8,
          operations: [
            {
              type: "delete-block",
              target: { blockId: "item", expectedText: "Nested item" },
            },
          ],
        },
        7
      )
    ).toThrow("content revision");
    expect(() =>
      editor.apply(
        {
          baseContentRevision: 7,
          operations: [
            {
              type: "delete-block",
              target: { blockId: "item", expectedText: "Changed" },
            },
          ],
        },
        7
      )
    ).toThrow("expected text");
    expect(editor.getContent()).toEqual(before);
    editor.destroy();
  });

  it("deletes exact blocks and validates attribute values before applying a batch", () => {
    const withCode = {
      type: "doc",
      content: [
        ...source.content,
        {
          type: "codeBlock",
          attrs: { blockId: "code", language: null },
          content: [{ type: "text", text: "const x = 1" }],
        },
      ],
    };
    const deleted = applyDocumentOperations({
      content: withCode,
      contentRevision: 3,
      batch: {
        baseContentRevision: 3,
        operations: [
          {
            type: "set-block-attributes",
            target: { blockId: "code", expectedText: "const x = 1" },
            attributes: { language: "typescript" },
          },
          {
            type: "delete-block",
            target: { blockId: "item", expectedText: "Nested item" },
          },
        ],
      },
    });
    expect(deleted.plainText).toBe("A marked heading\nconst x = 1");
    expect(deleted.content.content?.at(-1)?.attrs?.language).toBe("typescript");
    expect(() =>
      applyDocumentOperations({
        content: source,
        contentRevision: 3,
        batch: {
          baseContentRevision: 3,
          operations: [
            {
              type: "set-block-attributes",
              target: { blockId: "heading", expectedText: "A marked heading" },
              attributes: { level: 99 as 1 },
            },
          ],
        },
      })
    ).toThrow("heading level");
  });

  it("does not dispatch an earlier operation when a later target is invalid", () => {
    const editor = createDocumentEditorSession(source);
    const before = editor.getContent();
    expect(() =>
      editor.apply(
        {
          baseContentRevision: 3,
          operations: [
            {
              type: "replace-text",
              target: {
                blockId: "heading",
                expectedText: "A marked heading",
                from: 0,
                to: 1,
              },
              text: "The",
            },
            {
              type: "delete-block",
              target: { blockId: "missing", expectedText: "Nothing" },
            },
          ],
        },
        3
      )
    ).toThrow("was not found");
    expect(editor.getContent()).toEqual(before);
    editor.destroy();
  });

  it("exports the schema extensions through the package entry point", () => {
    expect(createDocumentEditorExtensions()).not.toHaveLength(0);
  });
});
