import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import { addBlockIds, identityExtensions } from "./extensions";
import { BlockControls } from "./block-controls";

vi.mock("@tiptap/extension-drag-handle-react", async () => {
  const React = await import("react");
  return {
    default: function MockDragHandle({ children, editor, onNodeChange }: { children: React.ReactNode; editor: Editor; onNodeChange(data: { node: typeof editor.state.doc.firstChild; editor: Editor; pos: number }): void }) {
      React.useEffect(() => { onNodeChange({ node: editor.state.doc.firstChild, editor, pos: 0 }); }, [editor, onNodeChange]);
      return <>{children}</>;
    },
  };
});

const editors: Editor[] = [];
function makeEditor() {
  const editor = new Editor({ content: addBlockIds({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }] }), extensions: identityExtensions });
  editors.push(editor);
  return editor;
}
afterEach(() => { cleanup(); editors.splice(0).forEach((editor) => editor.destroy()); });

describe("BlockControls", () => {
  it("renders exactly the add and combined grip/menu controls", async () => {
    const editor = makeEditor();
    render(<BlockControls editor={editor} pageId="00000000-0000-4000-8000-000000000001" onAskAI={vi.fn()}/>);
    const controls = await screen.findByTestId("block-controls");
    expect(within(controls).getAllByRole("button")).toHaveLength(2);
    expect(within(controls).getByLabelText("Thêm block bên dưới")).toBeInTheDocument();
    expect(within(controls).getByLabelText("Kéo block hoặc mở tùy chọn")).toBeInTheDocument();
  });

  it("opens the searchable block picker without editing until a block type is chosen", async () => {
    const editor = makeEditor();
    render(<BlockControls editor={editor} pageId="00000000-0000-4000-8000-000000000001" onAskAI={vi.fn()}/>);
    await waitFor(() => expect(screen.getByLabelText("Thêm block bên dưới")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText("Thêm block bên dưới"));
    expect(editor.state.doc.childCount).toBe(1);
    expect(await screen.findByPlaceholderText("Tìm loại block…")).toBeInTheDocument();
    expect(screen.getByText("Heading 1")).toBeInTheDocument();
    expect(screen.getByText("Ask AI")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Heading 1"));
    expect(editor.state.doc.childCount).toBeGreaterThan(1);
    expect(editor.state.doc.content.content.some((node) => node.type.name === "heading")).toBe(true);
  });

  it("starts an insert proposal from the existing block without adding an empty block", async () => {
    const editor = makeEditor();
    const originalId = editor.state.doc.firstChild?.attrs.blockId;
    const onAskAI = vi.fn();
    render(<BlockControls editor={editor} pageId="00000000-0000-4000-8000-000000000001" onAskAI={onAskAI}/>);
    fireEvent.click(await screen.findByLabelText("Thêm block bên dưới"));
    fireEvent.click(await screen.findByText("Ask AI"));
    expect(editor.state.doc.childCount).toBe(1);
    expect(onAskAI).toHaveBeenCalledWith(
      "improve",
      originalId,
      "insert"
    );
  });

  it("exposes the complete keyboard-accessible options menu", async () => {
    const editor = makeEditor();
    render(<BlockControls editor={editor} pageId="00000000-0000-4000-8000-000000000001" onAskAI={vi.fn()}/>);
    fireEvent.pointerDown(screen.getByLabelText("Kéo block hoặc mở tùy chọn"), { button: 0 });
    fireEvent.click(screen.getByLabelText("Kéo block hoặc mở tùy chọn"));
    expect(await screen.findByText("Turn into")).toBeInTheDocument();
    expect(screen.getByText("Ask AI")).toBeInTheDocument();
    expect(screen.getByText("Duplicate")).toBeInTheDocument();
    expect(screen.getByText("Copy block link")).toBeInTheDocument();
    expect(screen.getByText("Move up")).toBeInTheDocument();
    expect(screen.getByText("Move down")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  it("does not open the options menu from the click emitted after dragging", async () => {
    const editor = makeEditor();
    render(<BlockControls editor={editor} pageId="00000000-0000-4000-8000-000000000001" onAskAI={vi.fn()}/>);
    const grip = await screen.findByLabelText("Kéo block hoặc mở tùy chọn");
    fireEvent.dragStart(grip);
    fireEvent.dragEnd(grip);
    fireEvent.click(grip);
    expect(screen.queryByText("Turn into")).not.toBeInTheDocument();
  });

  it("opens a confirmation dialog before deleting a non-empty block", async () => {
    const editor = makeEditor();
    render(<BlockControls editor={editor} pageId="00000000-0000-4000-8000-000000000001" onAskAI={vi.fn()}/>);
    const grip = await screen.findByLabelText("Kéo block hoặc mở tùy chọn");
    fireEvent.pointerDown(grip, { button: 0 });
    fireEvent.click(grip);
    fireEvent.click(await screen.findByText("Delete"));
    expect(await screen.findByText("Xóa block này?")).toBeInTheDocument();
    expect(editor.state.doc.textContent).toBe("Hello");
  });
});
