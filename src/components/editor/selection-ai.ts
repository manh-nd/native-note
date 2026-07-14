import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { Extension } from "@tiptap/core";
import { diffWordsWithSpace } from "diff";
import { BLOCK_ID_ATTRIBUTE } from "./extensions";

export const selectionWordDiff = diffWordsWithSpace;
const preservedSelections = new WeakMap<Editor, { from: number; to: number }>();

export function rememberEditorSelection(editor: Editor, range: { from: number; to: number }) {
  preservedSelections.set(editor, range);
}

export function preservedEditorSelection(editor: Editor) {
  return preservedSelections.get(editor);
}

export type PlainTextBlock = {
  nodeType: string;
  blockId?: string;
  pmFrom: number;
  pmTo: number;
  plainFrom: number;
  plainTo: number;
  text: string;
};

export type SelectionSourceSegment = PlainTextBlock & {
  id: string;
};

export type SelectionAiSegment = {
  id: string;
  findingId?: string;
  result: string;
  category: "grammar" | "word_choice" | "collocation" | "naturalness" | "register" | "clarity";
  explanationVi: string;
  exampleEn: string;
  register: string;
  confidence: number;
};

export type SelectionAiResult = {
  reviewId: string;
  pageVersion: number;
  noChange: boolean;
  summaryVi: string;
  segments: SelectionAiSegment[];
};

function textOf(node: ProseMirrorNode, from = 0, to = node.content.size) {
  return node.textBetween(from, to, "\n", "\ufffc");
}

export function buildPlainTextIndex(doc: ProseMirrorNode) {
  const rawBlocks: Array<Omit<PlainTextBlock, "plainFrom" | "plainTo">> = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const value = textOf(node);
    rawBlocks.push({
      nodeType: node.type.name,
      blockId: node.attrs[BLOCK_ID_ATTRIBUTE] || undefined,
      pmFrom: pos + 1,
      pmTo: pos + node.nodeSize - 1,
      text: value,
    });
    return false;
  });
  while (rawBlocks.at(-1)?.text === "") rawBlocks.pop();
  let text = "";
  const blocks = rawBlocks.map((block, index) => {
    if (index) text += "\n";
    const plainFrom = text.length;
    text += block.text;
    return { ...block, plainFrom, plainTo: text.length };
  });
  return { text, blocks };
}

export function selectionSnapshot(segments: Pick<SelectionSourceSegment, "text">[]) {
  return segments.map((segment) => segment.text).join("\n");
}

export function selectionSegments(editor: Editor, range?: { from: number; to: number }): SelectionSourceSegment[] {
  const from = range?.from ?? editor.state.selection.from;
  const to = range?.to ?? editor.state.selection.to;
  if (from === to) return [];
  const index = buildPlainTextIndex(editor.state.doc);
  return index.blocks.flatMap((block, blockIndex) => {
    const pmFrom = Math.max(from, block.pmFrom);
    const pmTo = Math.min(to, block.pmTo);
    if (pmFrom >= pmTo) return [];
    const node = editor.state.doc.nodeAt(block.pmFrom - 1);
    if (!node) return [];
    const before = textOf(node, 0, pmFrom - block.pmFrom);
    const selected = textOf(node, pmFrom - block.pmFrom, pmTo - block.pmFrom);
    if (!selected) return [];
    const plainFrom = block.plainFrom + before.length;
    return [{
      ...block,
      id: `segment-${blockIndex}-${plainFrom}-${plainFrom + selected.length}`,
      pmFrom,
      pmTo,
      plainFrom,
      plainTo: plainFrom + selected.length,
      text: selected,
    }];
  });
}

const previewKey = new PluginKey<DecorationSet>("selectionAiPreview");

export const SelectionAiPreview = Extension.create({
  name: "selectionAiPreview",
  addProseMirrorPlugins() {
    return [new Plugin<DecorationSet>({
      key: previewKey,
      state: {
        init: () => DecorationSet.empty,
        apply: (tr, current) => {
          const next = tr.getMeta(previewKey) as DecorationSet | "clear" | undefined;
          if (next === "clear" || tr.docChanged) return DecorationSet.empty;
          return next ?? current.map(tr.mapping, tr.doc);
        },
      },
      props: { decorations: (state) => previewKey.getState(state) },
    })];
  },
});

export function clearSelectionAiPreview(editor: Editor) {
  editor.view.dispatch(editor.state.tr.setMeta(previewKey, "clear"));
}

export function showSelectionAiPreview(editor: Editor, sources: SelectionSourceSegment[], results: SelectionAiSegment[]) {
  const byId = new Map(results.map((result) => [result.id, result]));
  const decorations: Decoration[] = [];
  for (const source of sources) {
    const result = byId.get(source.id);
    if (!result || result.result === source.text) continue;
    let cursor = source.pmFrom;
    for (const part of selectionWordDiff(source.text, result.result)) {
      if (part.added) {
        decorations.push(Decoration.widget(cursor, () => {
          const span = document.createElement("span");
          span.className = "selection-ai-addition";
          span.textContent = part.value;
          return span;
        }, { side: 1 }));
      } else {
        const end = cursor + part.value.length;
        if (part.removed) decorations.push(Decoration.inline(cursor, end, { class: "selection-ai-removal" }));
        cursor = end;
      }
    }
  }
  editor.view.dispatch(editor.state.tr.setMeta(previewKey, DecorationSet.create(editor.state.doc, decorations)));
}

export function selectionIsCurrent(editor: Editor, sources: SelectionSourceSegment[]) {
  return sources.every((source) => editor.state.doc.textBetween(source.pmFrom, source.pmTo, "\n", "\ufffc") === source.text);
}

export function applySelectionAiResult(editor: Editor, sources: SelectionSourceSegment[], results: SelectionAiSegment[]) {
  if (!selectionIsCurrent(editor, sources)) return false;
  const byId = new Map(results.map((result) => [result.id, result]));
  let tr = editor.state.tr;
  for (const source of [...sources].sort((a, b) => b.pmFrom - a.pmFrom)) {
    const result = byId.get(source.id);
    if (!result || result.result === source.text) continue;
    const marks = editor.state.doc.resolve(source.pmFrom).marks();
    tr = tr.replaceWith(source.pmFrom, source.pmTo, editor.schema.text(result.result, marks));
  }
  tr.setMeta("addToHistory", true).setMeta(previewKey, "clear");
  editor.view.dispatch(tr);
  return true;
}
