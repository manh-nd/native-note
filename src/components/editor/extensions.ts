import { Extension, type JSONContent } from "@tiptap/core";
import { generateUniqueIds } from "@tiptap/extension-unique-id";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { CodeBlockComponent } from "./CodeBlock";
import {
  BLOCK_ID_ATTRIBUTE,
  createDocumentEditorExtensions,
  DocumentCodeBlock,
} from "@/packages/document-editor";

export { BLOCK_ID_ATTRIBUTE };

export const CustomCodeBlockLowlight = DocumentCodeBlock.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockComponent);
  },
});
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

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
  ...createDocumentEditorExtensions(CustomCodeBlockLowlight),
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
