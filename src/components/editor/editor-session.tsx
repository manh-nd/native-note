"use client";

import { memo, useEffect } from "react";
import type { Editor, JSONContent } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import Placeholder from "@tiptap/extension-placeholder";
import { BlockDeepLinkHighlight, identityExtensions } from "./extensions";
import { SelectionAiPreview } from "./selection-ai";

type EditorSessionProps = {
  pageId: string;
  content: JSONContent;
  onReady: (editor: Editor | null) => void;
  onUpdate: (editor: Editor) => void;
  onSelectionUpdate: (editor: Editor) => void;
  onCreate: (editor: Editor, pageId: string) => void;
  onKeyDown: (event: KeyboardEvent) => boolean;
  /** Test instrumentation for the editor-session render boundary. */
  onRender?: () => void;
};

function EditorSessionComponent({
  content,
  onCreate,
  onKeyDown,
  onReady,
  onRender,
  onSelectionUpdate,
  onUpdate,
  pageId,
}: EditorSessionProps) {
  onRender?.();
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      ...identityExtensions,
      Placeholder.configure({ placeholder: "Bắt đầu viết… Gõ / để mở lệnh" }),
      BlockDeepLinkHighlight,
      SelectionAiPreview,
    ],
    content,
    editorProps: {
      attributes: { class: "tiptap notion-editor" },
      handleDOMEvents: {
        pointerdown: (view, event) => {
          const pointer = event as PointerEvent;
          if (pointer.pointerType !== "mouse")
            requestAnimationFrame(() =>
              view.dom.dispatchEvent(
                new MouseEvent("mousemove", {
                  bubbles: true,
                  clientX: pointer.clientX,
                  clientY: pointer.clientY,
                })
              )
            );
          return false;
        },
      },
      handleKeyDown: (_, event) => onKeyDown(event),
    },
    onUpdate: ({ editor: current }) => onUpdate(current),
    onSelectionUpdate: ({ editor: current }) => onSelectionUpdate(current),
    onCreate: ({ editor: current }) => onCreate(current, pageId),
  });

  useEffect(() => {
    onReady(editor);
    return () => onReady(null);
  }, [editor, onReady]);

  return <EditorContent editor={editor} />;
}

/**
 * The live editor is intentionally insensitive to workspace-level state.
 * A Page switch remounts it with that Page's canonical StoredDocument; all
 * other workspace renders leave its Tiptap session in place.
 */
export const EditorSession = memo(
  EditorSessionComponent,
  (previous, next) => previous.pageId === next.pageId
);
