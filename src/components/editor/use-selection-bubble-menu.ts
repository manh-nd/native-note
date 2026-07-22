"use client";

import { useCallback, useState } from "react";
import type { Editor } from "@tiptap/core";
import {
  rememberEditorSelection,
  preservedEditorSelection,
} from "./selection-ai";

export type SelectionBubbleState = {
  text: string;
  from: number;
  to: number;
  visible: boolean;
};

export function useSelectionBubbleMenu() {
  const [selectionAi, setSelectionAi] = useState<SelectionBubbleState>({
    text: "",
    from: 0,
    to: 0,
    visible: false,
  });

  const updateSelectionState = useCallback((editor: Editor | null) => {
    if (!editor || editor.isDestroyed) return;
    const { from, to, empty } = editor.state.selection;
    if (empty) {
      setSelectionAi((prev) =>
        prev.visible ? { ...prev, visible: false } : prev
      );
      return;
    }

    const text = editor.state.doc.textBetween(from, to, "\n");
    if (!text.trim()) {
      setSelectionAi((prev) =>
        prev.visible ? { ...prev, visible: false } : prev
      );
      return;
    }

    rememberEditorSelection(editor, { from, to });
    setSelectionAi({
      text,
      from,
      to,
      visible: true,
    });
  }, []);

  const hideSelectionMenu = useCallback(() => {
    setSelectionAi((prev) => ({ ...prev, visible: false }));
  }, []);

  return {
    selectionAi,
    setSelectionAi,
    updateSelectionState,
    hideSelectionMenu,
  };
}
