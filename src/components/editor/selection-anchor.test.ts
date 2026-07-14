import { afterEach, describe, expect, it, vi } from "vitest";
import type { Editor } from "@tiptap/core";
import { createSelectionVirtualElement, measureSelectionReference } from "./selection-anchor";

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  } as DOMRect;
}

afterEach(() => vi.restoreAllMocks());

describe("selection virtual anchor", () => {
  it("measures the current native range and exposes every line rect", () => {
    const root = document.createElement("div");
    const text = document.createTextNode("A multi-line selection");
    root.append(text);
    document.body.append(root);
    root.getBoundingClientRect = () => rect(80, 100, 500, 300);
    const firstLine = rect(120, 150, 180, 24);
    const secondLine = rect(120, 174, 90, 24);
    const bounding = rect(120, 150, 180, 48);
    vi.spyOn(window, "getSelection").mockReturnValue({
      anchorNode: text,
      focusNode: text,
      isCollapsed: false,
      rangeCount: 1,
      getRangeAt: () => ({
        getBoundingClientRect: () => bounding,
        getClientRects: () => [firstLine, secondLine],
      }),
    } as unknown as Selection);
    const editor = {
      isDestroyed: false,
      state: { selection: { empty: false, from: 1, to: 12 } },
      view: { dom: root },
    } as unknown as Editor;

    expect(measureSelectionReference(editor)).toEqual({ boundingRect: bounding, clientRects: [firstLine, secondLine] });
    expect(createSelectionVirtualElement(editor).getClientRects()).toEqual([firstLine, secondLine]);
    root.remove();
  });

  it("re-measures instead of caching a stale selection rect", () => {
    const root = document.createElement("div");
    const text = document.createTextNode("Selection");
    root.append(text);
    document.body.append(root);
    root.getBoundingClientRect = () => rect(0, 0, 800, 800);
    let current = rect(100, 200, 120, 22);
    vi.spyOn(window, "getSelection").mockReturnValue({
      anchorNode: text,
      focusNode: text,
      isCollapsed: false,
      rangeCount: 1,
      getRangeAt: () => ({ getBoundingClientRect: () => current, getClientRects: () => [current] }),
    } as unknown as Selection);
    const editor = {
      isDestroyed: false,
      state: { selection: { empty: false, from: 1, to: 8 } },
      view: { dom: root },
    } as unknown as Editor;
    const reference = createSelectionVirtualElement(editor);

    expect(reference.getBoundingClientRect().top).toBe(200);
    current = rect(160, 420, 100, 22);
    expect(reference.getBoundingClientRect().top).toBe(420);
    root.remove();
  });
});
