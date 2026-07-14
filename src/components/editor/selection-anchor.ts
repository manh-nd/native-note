import { posToDOMRect, type Editor } from "@tiptap/core";

type RectLike = Pick<DOMRect, "bottom" | "height" | "left" | "right" | "top" | "width" | "x" | "y">;

export type SelectionReferenceMeasurement = {
  boundingRect: RectLike;
  clientRects: RectLike[];
};

function containsNode(root: HTMLElement, node: Node | null) {
  return Boolean(node && (node === root || root.contains(node)));
}

function isUsableRect(rect: RectLike, editorRect: DOMRect) {
  return [rect.top, rect.right, rect.bottom, rect.left, rect.width, rect.height].every(Number.isFinite)
    && rect.width > 0
    && rect.height > 0
    && rect.right >= editorRect.left
    && rect.left <= editorRect.right
    && rect.bottom >= editorRect.top
    && rect.top <= editorRect.bottom;
}

export function measureSelectionReference(editor: Editor): SelectionReferenceMeasurement | null {
  if (editor.isDestroyed || editor.state.selection.empty) return null;

  const editorElement = editor.view.dom;
  const editorRect = editorElement.getBoundingClientRect();
  const browserSelection = window.getSelection();

  if (
    browserSelection
    && !browserSelection.isCollapsed
    && browserSelection.rangeCount > 0
    && containsNode(editorElement, browserSelection.anchorNode)
    && containsNode(editorElement, browserSelection.focusNode)
  ) {
    const range = browserSelection.getRangeAt(0);
    const boundingRect = range.getBoundingClientRect();
    const clientRects = Array.from(range.getClientRects()).filter((rect) => isUsableRect(rect, editorRect));
    if (isUsableRect(boundingRect, editorRect) && clientRects.length) {
      return { boundingRect, clientRects };
    }
  }

  const { from, to } = editor.state.selection;
  const fallback = posToDOMRect(editor.view, from, to);
  if (!isUsableRect(fallback as RectLike, editorRect)) return null;
  return { boundingRect: fallback as RectLike, clientRects: [fallback as RectLike] };
}

export function createSelectionVirtualElement(editor: Editor) {
  return {
    contextElement: editor.view.dom,
    getBoundingClientRect: () => measureSelectionReference(editor)?.boundingRect ?? new DOMRect(),
    getClientRects: () => measureSelectionReference(editor)?.clientRects ?? [],
  };
}
