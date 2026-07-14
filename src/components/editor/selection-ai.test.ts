import { describe, expect, it } from "vitest";
import { Editor, type JSONContent } from "@tiptap/core";
import { addBlockIds, identityExtensions } from "./extensions";
import {
  SelectionAiPreview,
  applySelectionAiResult,
  buildPlainTextIndex,
  selectionSegments,
  selectionWordDiff,
  type SelectionAiSegment,
} from "./selection-ai";

function makeEditor(content: JSONContent) {
  return new Editor({ content: addBlockIds(content), extensions: [...identityExtensions, SelectionAiPreview] });
}

function aiResult(id: string, result: string): SelectionAiSegment {
  return { id, result, category: "naturalness", explanationVi: "Tự nhiên hơn", exampleEn: result, register: "neutral", confidence: 0.9 };
}

describe("canonical plain-text index", () => {
  it("maps paragraphs, nested list text, duplicate text, and Unicode without ambiguous search", () => {
    const editor = makeEditor({ type: "doc", content: [
      { type: "paragraph", content: [{ type: "text", text: "Same 😀" }] },
      { type: "bulletList", content: [{ type: "listItem", content: [
        { type: "paragraph", content: [{ type: "text", text: "First" }] },
        { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Nested" }] }] }] },
      ] }] },
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Same 😀" }] },
    ] });
    const index = buildPlainTextIndex(editor.state.doc);
    expect(index.text).toBe("Same 😀\nFirst\nNested\nSame 😀");
    expect(index.blocks.map((block) => index.text.slice(block.plainFrom, block.plainTo))).toEqual(["Same 😀", "First", "Nested", "Same 😀"]);
    expect(index.blocks[0].plainFrom).not.toBe(index.blocks[3].plainFrom);
    editor.destroy();
  });

  it("splits a partial multi-block selection and retains block IDs", () => {
    const editor = makeEditor({ type: "doc", content: [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Heading" }] },
      { type: "paragraph", content: [{ type: "text", text: "Paragraph" }] },
      { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "Quote" }] }] },
    ] });
    const index = buildPlainTextIndex(editor.state.doc);
    editor.commands.setTextSelection({ from: index.blocks[0].pmFrom + 2, to: index.blocks[2].pmFrom + 3 });
    const segments = selectionSegments(editor);
    expect(segments.map((segment) => segment.text)).toEqual(["ading", "Paragraph", "Quo"]);
    expect(segments.every((segment) => Boolean(segment.blockId))).toBe(true);
    expect(segments.map((segment) => segment.nodeType)).toEqual(["heading", "paragraph", "paragraph"]);
    editor.destroy();
  });
});

describe("selection diff and apply", () => {
  it("diffs whitespace, punctuation, and Unicode", () => {
    const parts = selectionWordDiff("Hello,  thế giới!", "Hi, thế giới 😀!");
    expect(parts.some((part) => part.removed)).toBe(true);
    expect(parts.some((part) => part.added)).toBe(true);
    expect(parts.map((part) => part.value).join("")).toContain("😀");
  });

  it("applies multiple segments in one undoable transaction while preserving block structure", () => {
    const editor = makeEditor({ type: "doc", content: [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Old heading" }] },
      { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Old item" }] }] }] },
      { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "Old quote" }] }] },
    ] });
    const index = buildPlainTextIndex(editor.state.doc);
    editor.commands.setTextSelection({ from: index.blocks[0].pmFrom, to: index.blocks[2].pmTo });
    const sources = selectionSegments(editor);
    const results = sources.map((source, index) => aiResult(source.id, ["New heading", "New item", "New quote"][index]));
    expect(applySelectionAiResult(editor, sources, results)).toBe(true);
    expect(editor.state.doc.child(0).type.name).toBe("heading");
    expect(editor.state.doc.child(1).type.name).toBe("bulletList");
    expect(editor.state.doc.child(2).type.name).toBe("blockquote");
    expect(buildPlainTextIndex(editor.state.doc).text).toBe("New heading\nNew item\nNew quote");
    expect(editor.commands.undo()).toBe(true);
    expect(buildPlainTextIndex(editor.state.doc).text).toBe("Old heading\nOld item\nOld quote");
    editor.destroy();
  });
});
