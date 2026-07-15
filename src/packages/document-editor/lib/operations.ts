import { Editor } from "@tiptap/core";
import { EditorState, Transaction } from "@tiptap/pm/state";
import {
  Fragment,
  Node as ProseMirrorNode,
  type Schema,
} from "@tiptap/pm/model";
import {
  BLOCK_ID_ATTRIBUTE,
  asJsonContent,
  blockId,
  createDocumentEditorExtensions,
  DocumentContent,
  DocumentEditorError,
  isEditableBlock,
  plainTextFromDocument,
  prepareDocumentContent,
  toProseMirrorDocument,
} from "./schema";

export type DocumentTarget = {
  blockId: string;
  expectedText: string;
};

export type TextReplacementTarget = DocumentTarget & {
  from: number;
  to: number;
};

export type AllowedBlockAttributes = {
  blockColor?: string | null;
  blockBackground?: string | null;
  level?: 1 | 2 | 3 | 4 | 5 | 6;
  checked?: boolean;
  language?: string | null;
};

export type DocumentOperation =
  | { type: "replace-text"; target: TextReplacementTarget; text: string }
  | {
      type: "insert-blocks-after";
      target: DocumentTarget;
      blocks: DocumentContent[];
    }
  | {
      type: "set-block-attributes";
      target: DocumentTarget;
      attributes: AllowedBlockAttributes;
    }
  | { type: "delete-block"; target: DocumentTarget };

export type DocumentOperationBatch = {
  baseContentRevision: number;
  operations: DocumentOperation[];
};

export type PortableExcerpt = {
  blockId: string;
  type: string;
  text: string;
  attributes: Record<string, unknown>;
  nestingPath: string[];
};

export type DocumentTextBlock = {
  blockId: string;
  text: string;
  from: number;
  to: number;
};

export type DocumentTextIndex = {
  text: string;
  blocks: DocumentTextBlock[];
};

export type AppliedDocumentOperations = {
  content: DocumentContent;
  plainText: string;
  excerpts: PortableExcerpt[];
};

export class DocumentOperationError extends DocumentEditorError {
  constructor(message: string) {
    super(message);
    this.name = "DocumentOperationError";
  }
}

type LocatedBlock = { node: ProseMirrorNode; pos: number };

function locateBlock(document: ProseMirrorNode, id: string): LocatedBlock {
  let located: LocatedBlock | undefined;
  document.descendants((node, pos) => {
    if (blockId(node) !== id) return true;
    located = { node, pos };
    return false;
  });
  if (!located)
    throw new DocumentOperationError(`block "${id}" was not found.`);
  return located;
}

function directBlockText(node: ProseMirrorNode): string {
  if (node.isTextblock)
    return node.textBetween(0, node.content.size, "\n", "\ufffc");
  let text = "";
  node.forEach((child) => {
    if (text || !child.isTextblock) return;
    text = child.textBetween(0, child.content.size, "\n", "\ufffc");
  });
  return text;
}

function assertTarget(
  document: ProseMirrorNode,
  target: DocumentTarget
): LocatedBlock {
  const located = locateBlock(document, target.blockId);
  const actual = directBlockText(located.node);
  if (actual !== target.expectedText) {
    throw new DocumentOperationError(
      `block "${target.blockId}" expected text no longer matches.`
    );
  }
  return located;
}

function textContainer(
  node: ProseMirrorNode,
  pos: number
): { node: ProseMirrorNode; pos: number } {
  if (node.isTextblock) return { node, pos };
  let result: { node: ProseMirrorNode; pos: number } | undefined;
  node.forEach((child, childOffset) => {
    if (!result && child.isTextblock) {
      result = { node: child, pos: pos + 1 + childOffset };
    }
  });
  if (!result) {
    throw new DocumentOperationError(
      `${node.type.name} has no editable text content.`
    );
  }
  return result;
}

function textRange(
  node: ProseMirrorNode,
  start: number,
  end: number
): { from: number; to: number } {
  if (
    !node.isTextblock ||
    start < 0 ||
    end < start ||
    end > node.textContent.length
  ) {
    throw new DocumentOperationError(
      "text offsets must select text in one editable text block."
    );
  }
  return { from: start, to: end };
}

function validateAttributes(
  node: ProseMirrorNode,
  attributes: AllowedBlockAttributes
) {
  const allowed = new Set(["blockColor", "blockBackground"]);
  if (node.type.name === "heading") allowed.add("level");
  if (node.type.name === "taskItem") allowed.add("checked");
  if (node.type.name === "codeBlock") allowed.add("language");
  for (const key of Object.keys(attributes)) {
    if (!allowed.has(key)) {
      throw new DocumentOperationError(
        `${key} is not allowed on ${node.type.name}.`
      );
    }
  }
  for (const key of ["blockColor", "blockBackground", "language"] as const) {
    if (
      key in attributes &&
      attributes[key] !== null &&
      typeof attributes[key] !== "string"
    ) {
      throw new DocumentOperationError(`${key} must be a string or null.`);
    }
  }
  if ("level" in attributes) {
    const level = attributes.level;
    if (
      !Number.isInteger(level) ||
      level === undefined ||
      level < 1 ||
      level > 6
    ) {
      throw new DocumentOperationError(
        "heading level must be an integer from 1 to 6."
      );
    }
  }
  if ("checked" in attributes && typeof attributes.checked !== "boolean") {
    throw new DocumentOperationError("checked must be a boolean.");
  }
}

function blocksForInsertion(
  blocks: DocumentContent[],
  schema: Schema
): ProseMirrorNode[] {
  if (!blocks.length)
    throw new DocumentOperationError(
      "at least one block is required for insertion."
    );
  return blocks.map((block) => {
    const prepared = prepareDocumentContent({ type: "doc", content: [block] });
    const node = ProseMirrorNode.fromJSON(schema, prepared.content).firstChild;
    if (!node) throw new DocumentOperationError("inserted block is empty.");
    return node;
  });
}

function applyOperation(
  tr: Transaction,
  operation: DocumentOperation
): Transaction {
  const { node, pos } = assertTarget(tr.doc, operation.target);
  if (operation.type === "replace-text") {
    const container = textContainer(node, pos);
    const range = textRange(
      container.node,
      operation.target.from,
      operation.target.to
    );
    const from = container.pos + 1 + range.from;
    const to = container.pos + 1 + range.to;
    const marks = tr.doc.resolve(from).marks();
    return operation.text
      ? tr.replaceWith(from, to, tr.doc.type.schema.text(operation.text, marks))
      : tr.delete(from, to);
  }
  if (operation.type === "set-block-attributes") {
    validateAttributes(node, operation.attributes);
    return tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      ...operation.attributes,
    });
  }
  if (operation.type === "insert-blocks-after") {
    const blocks = blocksForInsertion(operation.blocks, tr.doc.type.schema);
    return tr.insert(pos + node.nodeSize, Fragment.fromArray(blocks));
  }

  const resolved = tr.doc.resolve(pos);
  let from = pos;
  let to = pos + node.nodeSize;
  if (
    ["bulletList", "orderedList", "taskList"].includes(
      resolved.parent.type.name
    ) &&
    resolved.parent.childCount === 1
  ) {
    from = resolved.before(resolved.depth);
    to = from + resolved.parent.nodeSize;
  }
  if (from === 0 && to === tr.doc.content.size) {
    return tr.replaceWith(
      0,
      tr.doc.content.size,
      tr.doc.type.schema.nodes.paragraph.create({
        [BLOCK_ID_ATTRIBUTE]: crypto.randomUUID(),
      })
    );
  }
  return tr.delete(from, to);
}

function applyToTransaction(
  transaction: Transaction,
  batch: DocumentOperationBatch,
  contentRevision: number
): Transaction {
  if (batch.baseContentRevision !== contentRevision) {
    throw new DocumentOperationError(
      "content revision does not match this operation batch."
    );
  }
  if (!batch.operations.length) {
    throw new DocumentOperationError("an operation batch must not be empty.");
  }
  return batch.operations.reduce(applyOperation, transaction);
}

function applicationFromDocument(
  document: ProseMirrorNode
): AppliedDocumentOperations {
  const prepared = prepareDocumentContent(document.toJSON());
  return {
    ...prepared,
    excerpts: createPortableExcerpt(prepared.content),
  };
}

export function applyDocumentOperations({
  content,
  contentRevision,
  batch,
}: {
  content: unknown;
  contentRevision: number;
  batch: DocumentOperationBatch;
}): AppliedDocumentOperations {
  const document = toProseMirrorDocument(content);
  const state = EditorState.create({
    schema: document.type.schema,
    doc: document,
  });
  const transaction = applyToTransaction(state.tr, batch, contentRevision);
  return applicationFromDocument(transaction.doc);
}

export function applyDocumentOperationsToEditor(
  editor: Editor,
  batch: DocumentOperationBatch,
  contentRevision: number,
  origin?: string
): AppliedDocumentOperations {
  const transaction = applyToTransaction(
    editor.state.tr,
    batch,
    contentRevision
  );
  const result = applicationFromDocument(transaction.doc);
  if (origin) transaction.setMeta("documentOperationOrigin", origin);
  editor.view.dispatch(transaction.scrollIntoView());
  return result;
}

export function createPortableExcerpt(content: unknown): PortableExcerpt[] {
  const document = toProseMirrorDocument(content);
  const excerpts: PortableExcerpt[] = [];
  const walk = (node: ProseMirrorNode, path: string[]) => {
    if (isEditableBlock(node)) {
      const id = blockId(node);
      if (id) {
        excerpts.push({
          blockId: id,
          type: node.type.name,
          text: directBlockText(node),
          attributes: { ...node.attrs },
          nestingPath: path,
        });
      }
    }
    node.forEach((child) =>
      walk(child, node.type.name === "doc" ? path : [...path, node.type.name])
    );
  };
  document.forEach((node) => walk(node, []));
  return excerpts;
}

export function createDocumentTextIndex(content: unknown): DocumentTextIndex {
  const document = toProseMirrorDocument(content);
  const blocks: DocumentTextBlock[] = [];
  let text = "";
  document.descendants((node) => {
    if (!node.isTextblock) return true;
    const id = blockId(node);
    if (!id) return false;
    const blockText = node.textBetween(0, node.content.size, "\n", "\ufffc");
    if (blocks.length) text += "\n";
    const from = text.length;
    text += blockText;
    blocks.push({ blockId: id, text: blockText, from, to: text.length });
    return false;
  });
  while (blocks.at(-1)?.text === "") {
    const removed = blocks.pop()!;
    text = text.slice(0, removed.from - (blocks.length ? 1 : 0));
  }
  return { text, blocks };
}

export function createDocumentEditorSession(content: unknown) {
  const editor = new Editor({
    content: asJsonContent(prepareDocumentContent(content).content),
    extensions: createDocumentEditorExtensions(),
  });
  return {
    apply(batch: DocumentOperationBatch, contentRevision: number) {
      return applyDocumentOperationsToEditor(editor, batch, contentRevision);
    },
    getContent: () => editor.getJSON() as DocumentContent,
    getText: () => plainTextFromDocument(editor.state.doc),
    undo: () => editor.commands.undo(),
    destroy: () => editor.destroy(),
  };
}
