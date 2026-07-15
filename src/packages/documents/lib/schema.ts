import { Extension, type Extensions } from "@tiptap/core";
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

const lowlight = createLowlight(common);

export const BLOCK_ID_ATTRIBUTE = "blockId";
export const BLOCK_TYPES = [
  "paragraph",
  "heading",
  "listItem",
  "taskItem",
  "blockquote",
  "codeBlock",
];

export const BlockIdentity = UniqueID.configure({
  attributeName: BLOCK_ID_ATTRIBUTE,
  types: BLOCK_TYPES,
  generateID: () => crypto.randomUUID(),
});

export const BlockAppearance = Extension.create({
  name: "blockAppearance",
  addGlobalAttributes() {
    return [
      {
        types: BLOCK_TYPES,
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

export const StoredDocumentCodeBlock = CodeBlockLowlight.configure({
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

export function documentExtensions(
  codeBlock = StoredDocumentCodeBlock
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
