import {
  Extension,
  getSchema,
  type Extensions,
  type JSONContent,
} from "@tiptap/core";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { TextStyle } from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import UniqueID from "@tiptap/extension-unique-id";
import StarterKit from "@tiptap/starter-kit";
import { common, createLowlight } from "lowlight";
import { Node as ProseMirrorNode } from "@tiptap/pm/model";

export type DocumentContent = {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: DocumentContent[];
  text?: string;
  marks?: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

export const BLOCK_ID_ATTRIBUTE = "blockId";
export const EDITABLE_BLOCK_TYPES = [
  "paragraph",
  "heading",
  "listItem",
  "taskItem",
  "blockquote",
  "codeBlock",
] as const;

export type EditableBlockType = (typeof EDITABLE_BLOCK_TYPES)[number];
const editableBlockTypes = new Set<string>(EDITABLE_BLOCK_TYPES);
const lowlight = createLowlight(common);

export const BlockIdentity = UniqueID.configure({
  attributeName: BLOCK_ID_ATTRIBUTE,
  types: [...EDITABLE_BLOCK_TYPES],
  generateID: () => crypto.randomUUID(),
});

export const BlockAppearance = Extension.create({
  name: "blockAppearance",
  addGlobalAttributes() {
    return [
      {
        types: [...EDITABLE_BLOCK_TYPES],
        attributes: {
          blockColor: {
            default: null,
            parseHTML: (element) => element.getAttribute("data-block-color"),
            renderHTML: (attributes) => ({
              ...(attributes.blockColor
                ? { "data-block-color": attributes.blockColor }
                : {}),
              ...(attributes.blockId
                ? { id: `block=${attributes.blockId}` }
                : {}),
            }),
          },
          blockBackground: {
            default: null,
            parseHTML: (element) =>
              element.getAttribute("data-block-background"),
            renderHTML: (attributes) =>
              attributes.blockBackground
                ? { "data-block-background": attributes.blockBackground }
                : {},
          },
        },
      },
    ];
  },
});

export const DocumentCodeBlock = CodeBlockLowlight.configure({
  lowlight,
  defaultLanguage: "plaintext",
});

export const WritingMarks = [
  Underline,
  Link.configure({
    openOnClick: false,
    autolink: true,
    linkOnPaste: true,
    defaultProtocol: "https",
    isAllowedUri: (url) => /^(https?:|mailto:)/i.test(url),
  }),
  TextStyle,
  Color,
  Highlight.configure({ multicolor: true }),
];

export function createDocumentEditorExtensions(
  codeBlock = DocumentCodeBlock
): Extensions {
  return [
    StarterKit.configure({ link: false, underline: false, codeBlock: false }),
    TaskList,
    TaskItem.configure({ nested: true }),
    BlockIdentity,
    BlockAppearance,
    codeBlock,
    ...WritingMarks,
  ];
}

const schema = getSchema(createDocumentEditorExtensions());

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function migrateBlockIds(value: unknown, ids = new Set<string>()): unknown {
  if (!isRecord(value)) return value;
  const content = Array.isArray(value.content)
    ? value.content.map((child) => migrateBlockIds(child, ids))
    : value.content;
  const migrated: Record<string, unknown> = {
    ...value,
    ...(Array.isArray(content) ? { content } : {}),
  };
  if (!editableBlockTypes.has(String(value.type))) return migrated;
  if (value.attrs !== undefined && !isRecord(value.attrs)) {
    throw new DocumentEditorError(
      `${String(value.type)} has invalid attributes.`
    );
  }
  const attrs = { ...(value.attrs ?? {}) };
  const present = attrs[BLOCK_ID_ATTRIBUTE];
  const blockId =
    present === undefined || present === null || present === ""
      ? crypto.randomUUID()
      : present;
  if (typeof blockId !== "string") {
    throw new DocumentEditorError(
      `${String(value.type)} has a non-string stable block ID.`
    );
  }
  if (ids.has(blockId)) {
    throw new DocumentEditorError(
      `stable block ID "${blockId}" is duplicated.`
    );
  }
  ids.add(blockId);
  return { ...migrated, attrs: { ...attrs, [BLOCK_ID_ATTRIBUTE]: blockId } };
}

function assertBlockIds(document: ProseMirrorNode): void {
  const ids = new Set<string>();
  document.descendants((node) => {
    if (!editableBlockTypes.has(node.type.name)) return true;
    const blockId = node.attrs[BLOCK_ID_ATTRIBUTE];
    if (typeof blockId !== "string" || blockId.length === 0) {
      throw new DocumentEditorError(
        `${node.type.name} is missing its stable block ID.`
      );
    }
    if (ids.has(blockId)) {
      throw new DocumentEditorError(
        `stable block ID "${blockId}" is duplicated.`
      );
    }
    ids.add(blockId);
    return true;
  });
}

export class DocumentEditorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentEditorError";
  }
}

export function toProseMirrorDocument(content: unknown): ProseMirrorNode {
  try {
    const migrated = migrateBlockIds(content);
    const document = ProseMirrorNode.fromJSON(schema, migrated);
    assertBlockIds(document);
    return document;
  } catch (error) {
    if (error instanceof DocumentEditorError) throw error;
    const message =
      error instanceof Error ? error.message : "unknown schema error";
    throw new DocumentEditorError(
      `document is unsupported or invalid: ${message}`
    );
  }
}

export function prepareDocumentContent(content: unknown): {
  content: DocumentContent;
  plainText: string;
} {
  const document = toProseMirrorDocument(content);
  return {
    content: document.toJSON() as DocumentContent,
    plainText: plainTextFromDocument(document),
  };
}

export function plainTextFromDocument(document: ProseMirrorNode): string {
  const blocks: string[] = [];
  document.descendants((node) => {
    if (!node.isTextblock) return true;
    blocks.push(node.textBetween(0, node.content.size, "\n", "\ufffc"));
    return false;
  });
  while (blocks.at(-1) === "") blocks.pop();
  return blocks.join("\n");
}

export function plainTextFromDocumentBlocks(blocks: DocumentContent[]): string {
  return plainTextFromDocument(
    toProseMirrorDocument({ type: "doc", content: blocks })
  );
}

export function isEditableBlock(node: ProseMirrorNode): boolean {
  return editableBlockTypes.has(node.type.name);
}

export function blockId(node: ProseMirrorNode): string | null {
  const id = node.attrs[BLOCK_ID_ATTRIBUTE];
  return typeof id === "string" && id.length > 0 ? id : null;
}

export function asJsonContent(content: DocumentContent): JSONContent {
  return content as JSONContent;
}

export function documentSchema() {
  return schema;
}
