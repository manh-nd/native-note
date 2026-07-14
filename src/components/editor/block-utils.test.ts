import { describe, expect, it } from "vitest";
import { Editor, type JSONContent } from "@tiptap/core";
import { addBlockIds, identityExtensions } from "./extensions";
import { deleteBlock, duplicateBlock, findBlockById, isAiBlockResultStale, moveBlock, turnBlockInto } from "./block-utils";

function makeEditor(content: JSONContent) {
  return new Editor({ content, extensions: identityExtensions });
}

describe("block identity", () => {
  it("backfills IDs without replacing existing IDs", () => {
    const content = addBlockIds({ type: "doc", content: [
      { type: "paragraph", attrs: { blockId: "kept" }, content: [{ type: "text", text: "One" }] },
      { type: "paragraph", content: [{ type: "text", text: "Two" }] },
    ] });
    expect(content.content?.[0].attrs?.blockId).toBe("kept");
    expect(content.content?.[1].attrs?.blockId).toMatch(/[0-9a-f-]{36}/);
  });
});

describe("block transactions", () => {
  it("duplicates with a fresh ID and moves as one undoable transaction", () => {
    const editor = makeEditor(addBlockIds({ type: "doc", content: [
      { type: "paragraph", content: [{ type: "text", text: "One" }] },
      { type: "paragraph", content: [{ type: "text", text: "Two" }] },
    ] }));
    const firstId = editor.getJSON().content?.[0].attrs?.blockId as string;
    expect(duplicateBlock(editor, firstId)).toBe(true);
    const ids = editor.getJSON().content?.map((node) => node.attrs?.blockId);
    expect(ids?.[1]).not.toBe(firstId);
    expect(moveBlock(editor, firstId, "down")).toBe(true);
    expect(editor.commands.undo()).toBe(true);
    editor.destroy();
  });

  it("turns a paragraph into a heading", () => {
    const editor = makeEditor(addBlockIds({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Title" }] }] }));
    const id = editor.getJSON().content?.[0].attrs?.blockId as string;
    expect(turnBlockInto(editor, id, "heading2")).toBe(true);
    expect(findBlockById(editor, id)?.node.type.name).toBe("heading");
    editor.destroy();
  });

  it("deleting the final block leaves an empty paragraph", () => {
    const editor = makeEditor(addBlockIds({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Only" }] }] }));
    const id = editor.getJSON().content?.[0].attrs?.blockId as string;
    expect(deleteBlock(editor, id)).toBe(true);
    expect(editor.state.doc.childCount).toBe(1);
    expect(editor.state.doc.firstChild?.type.name).toBe("paragraph");
    editor.destroy();
  });
});

describe("AI block result safety", () => {
  it("becomes stale after block text or page version changes", () => {
    expect(isAiBlockResultStale("same", 4, "same", 4)).toBe(false);
    expect(isAiBlockResultStale("edited", 4, "same", 4)).toBe(true);
    expect(isAiBlockResultStale("same", 5, "same", 4)).toBe(true);
  });
});
