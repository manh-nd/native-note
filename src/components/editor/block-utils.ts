import type { Editor, JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { BLOCK_ID_ATTRIBUTE, renewBlockIds } from "./extensions";

export type BlockTarget = { id: string; pos: number; node: ProseMirrorNode };
export type BlockKind = "paragraph" | "heading1" | "heading2" | "heading3" | "bulletList" | "orderedList" | "taskList" | "blockquote" | "codeBlock";

export function findBlockById(editor: Editor, blockId: string): BlockTarget | null {
  let result: BlockTarget | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (node.attrs?.[BLOCK_ID_ATTRIBUTE] === blockId) {
      result = { id: blockId, node, pos };
      return false;
    }
    return result === null;
  });
  return result;
}

export function normalizeBlockTarget(editor: Editor, node: ProseMirrorNode, pos: number): BlockTarget | null {
  const resolved = editor.state.doc.resolve(Math.max(0, pos));
  for (let depth = resolved.depth; depth > 0; depth -= 1) {
    const parent = resolved.node(depth);
    if ((parent.type.name === "listItem" || parent.type.name === "taskItem") && parent.attrs?.[BLOCK_ID_ATTRIBUTE]) {
      return { id: parent.attrs[BLOCK_ID_ATTRIBUTE], node: parent, pos: resolved.before(depth) };
    }
  }
  const id = node.attrs?.[BLOCK_ID_ATTRIBUTE];
  return id ? { id, node, pos } : null;
}

export function blockText(node: ProseMirrorNode) {
  if (node.isTextblock)
    return node.textBetween(0, node.content.size, "\n", "\ufffc");
  let text = "";
  node.forEach((child) => {
    if (text || !child.isTextblock) return;
    text = child.textBetween(0, child.content.size, "\n", "\ufffc");
  });
  return text;
}

export function insertParagraphAfter(editor: Editor, target: BlockTarget) {
  const current = findBlockById(editor, target.id);
  if (!current) return null;
  const blockId = crypto.randomUUID();
  const insertionPos = current.pos + current.node.nodeSize;
  editor.chain().focus().insertContentAt(insertionPos, { type: "paragraph", attrs: { blockId } }).setTextSelection(insertionPos + 1).run();
  return blockId;
}

export function duplicateBlock(editor: Editor, blockId: string) {
  const target = findBlockById(editor, blockId);
  if (!target) return false;
  const json = renewBlockIds(target.node.toJSON() as JSONContent);
  return editor.chain().focus().insertContentAt(target.pos + target.node.nodeSize, json).run();
}

export function deleteBlock(editor: Editor, blockId: string) {
  const target = findBlockById(editor, blockId);
  if (!target) return false;
  const { doc, schema } = editor.state;
  const resolved = doc.resolve(target.pos);
  let from = target.pos;
  let to = target.pos + target.node.nodeSize;
  if ((resolved.parent.type.name === "bulletList" || resolved.parent.type.name === "orderedList" || resolved.parent.type.name === "taskList") && resolved.parent.childCount === 1) {
    from = resolved.before(resolved.depth);
    to = from + resolved.parent.nodeSize;
  }
  const tr = editor.state.tr;
  if (from === 0 && to === doc.content.size) tr.replaceWith(0, doc.content.size, schema.nodes.paragraph.create({ blockId: crypto.randomUUID() }));
  else tr.delete(from, to);
  editor.view.dispatch(tr.scrollIntoView());
  return true;
}

export function moveBlock(editor: Editor, blockId: string, direction: "up" | "down") {
  const target = findBlockById(editor, blockId);
  if (!target) return false;
  const resolved = editor.state.doc.resolve(target.pos);
  const index = resolved.index(resolved.depth);
  const parent = resolved.parent;
  if (direction === "up" && index === 0) return false;
  if (direction === "down" && index >= parent.childCount - 1) return false;
  const tr = editor.state.tr;
  if (direction === "up") {
    const previous = parent.child(index - 1);
    tr.delete(target.pos, target.pos + target.node.nodeSize).insert(target.pos - previous.nodeSize, target.node);
  } else {
    const next = parent.child(index + 1);
    tr.delete(target.pos, target.pos + target.node.nodeSize).insert(target.pos + next.nodeSize, target.node);
  }
  editor.view.dispatch(tr.scrollIntoView());
  return true;
}

export function moveBlockRelative(editor: Editor, sourceId: string, targetId: string, after: boolean) {
  if (sourceId === targetId) return false;
  const source = findBlockById(editor, sourceId);
  const target = findBlockById(editor, targetId);
  if (!source || !target) return false;
  const sourceResolved = editor.state.doc.resolve(source.pos);
  const targetResolved = editor.state.doc.resolve(target.pos);
  if (sourceResolved.parent.type !== targetResolved.parent.type) return false;
  const insertion = target.pos + (after ? target.node.nodeSize : 0);
  if (insertion >= source.pos && insertion <= source.pos + source.node.nodeSize) return false;
  const tr = editor.state.tr.delete(source.pos, source.pos + source.node.nodeSize);
  const mappedInsertion = tr.mapping.map(insertion, insertion > source.pos ? -1 : 1);
  try {
    tr.insert(mappedInsertion, source.node);
    editor.view.dispatch(tr.scrollIntoView());
    return true;
  } catch {
    return false;
  }
}

export function turnBlockInto(editor: Editor, blockId: string, kind: BlockKind) {
  const target = findBlockById(editor, blockId);
  if (!target) return false;
  const from = target.pos + 1;
  const to = Math.max(from, target.pos + target.node.nodeSize - 1);
  let chain = editor.chain().focus().setTextSelection({ from, to });
  if (target.node.type.name === "listItem" || target.node.type.name === "taskItem") chain = chain.liftListItem(target.node.type.name);
  if (kind === "paragraph") return chain.setParagraph().run();
  if (kind === "heading1" || kind === "heading2" || kind === "heading3") return chain.setHeading({ level: Number(kind.at(-1)) as 1 | 2 | 3 }).run();
  if (kind === "bulletList") return chain.toggleBulletList().run();
  if (kind === "orderedList") return chain.toggleOrderedList().run();
  if (kind === "taskList") return chain.toggleTaskList().run();
  if (kind === "blockquote") return chain.toggleBlockquote().run();
  return chain.toggleCodeBlock().run();
}

export function setBlockAppearance(editor: Editor, blockId: string, color: string | null, background: string | null) {
  const target = findBlockById(editor, blockId);
  if (!target) return false;
  editor.view.dispatch(editor.state.tr.setNodeMarkup(target.pos, undefined, { ...target.node.attrs, blockColor: color, blockBackground: background }));
  return true;
}

export function blockSnapshot(editor: Editor, blockId: string) {
  const target = findBlockById(editor, blockId);
  return target ? blockText(target.node) : null;
}

export function isAiBlockResultStale(currentSnapshot: string | null, currentVersion: number | undefined, expectedSnapshot: string, expectedVersion: number) {
  return currentSnapshot !== expectedSnapshot || currentVersion !== expectedVersion;
}
