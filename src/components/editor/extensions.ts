import { Extension, type JSONContent } from "@tiptap/core";
import UniqueID, { generateUniqueIds } from "@tiptap/extension-unique-id";
import StarterKit from "@tiptap/starter-kit";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { createLowlight, common } from "lowlight";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { CodeBlockComponent } from "./CodeBlock";

const lowlight = createLowlight(common);

export const CustomCodeBlockLowlight = CodeBlockLowlight.configure({
  lowlight,
  defaultLanguage: "plaintext",
}).extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockComponent);
  },
});
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

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

const blockHighlightKey = new PluginKey<DecorationSet>(
  "blockDeepLinkHighlight"
);

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    blockDeepLinkHighlight: {
      highlightBlock: (blockId: string | null) => ReturnType;
    };
  }
}

function highlightDecorations(
  doc: Parameters<typeof DecorationSet.create>[0],
  blockId: string | null
) {
  if (!blockId) return DecorationSet.empty;
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.attrs[BLOCK_ID_ATTRIBUTE] !== blockId) return true;
    decorations.push(
      Decoration.node(pos, pos + node.nodeSize, {
        class: "block-deep-link-highlight",
      })
    );
    return false;
  });
  return DecorationSet.create(doc, decorations);
}

export const BlockDeepLinkHighlight = Extension.create({
  name: "blockDeepLinkHighlight",
  addCommands() {
    return {
      highlightBlock:
        (blockId) =>
        ({ tr, dispatch }) => {
          if (dispatch) dispatch(tr.setMeta(blockHighlightKey, blockId));
          return true;
        },
    };
  },
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: blockHighlightKey,
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, current) => {
            const blockId = tr.getMeta(blockHighlightKey) as
              string | null | undefined;
            if (blockId !== undefined)
              return highlightDecorations(tr.doc, blockId);
            return tr.docChanged ? current.map(tr.mapping, tr.doc) : current;
          },
        },
        props: { decorations: (state) => blockHighlightKey.getState(state) },
      }),
    ];
  },
});

export const identityExtensions = [
  StarterKit.configure({ link: false, underline: false, codeBlock: false }),
  TaskList,
  TaskItem.configure({ nested: true }),
  BlockIdentity,
  BlockAppearance,
  CustomCodeBlockLowlight,
];

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

export function addBlockIds(content: JSONContent) {
  return generateUniqueIds(content, identityExtensions);
}

export function renewBlockIds(content: JSONContent): JSONContent {
  return {
    ...content,
    ...(content.attrs?.[BLOCK_ID_ATTRIBUTE]
      ? {
          attrs: {
            ...content.attrs,
            [BLOCK_ID_ATTRIBUTE]: crypto.randomUUID(),
          },
        }
      : {}),
    ...(content.content ? { content: content.content.map(renewBlockIds) } : {}),
  };
}
