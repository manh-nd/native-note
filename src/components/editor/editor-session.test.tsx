import { fireEvent, render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { EditorSession } from "./editor-session";

const storedDocument = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      attrs: { blockId: "paragraph" },
      content: [{ type: "text", text: "Initial content" }],
    },
  ],
};

describe("EditorSession", () => {
  it("binds editor creation to the session Page", async () => {
    const onCreate = vi.fn();
    render(
      <EditorSession
        pageId="page-1"
        content={storedDocument}
        onReady={vi.fn()}
        onUpdate={vi.fn()}
        onSelectionUpdate={vi.fn()}
        onCreate={onCreate}
        onKeyDown={vi.fn(() => false)}
      />
    );

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith(expect.anything(), "page-1")
    );
  });

  it("does not rerender its live editor when workspace sidebar state changes", async () => {
    const onReady = vi.fn();
    const onRender = vi.fn();
    const props = {
      pageId: "page-1",
      content: storedDocument,
      onReady,
      onUpdate: vi.fn(),
      onSelectionUpdate: vi.fn(),
      onCreate: vi.fn(),
      onKeyDown: vi.fn(() => false),
      onRender,
    };
    function WorkspaceStateProbe() {
      const [sidebarOpen, setSidebarOpen] = useState(true);
      return (
        <>
          <button onClick={() => setSidebarOpen((open) => !open)}>
            Toggle sidebar
          </button>
          {sidebarOpen && <aside>Sidebar</aside>}
          <EditorSession {...props} />
        </>
      );
    }

    const { getByRole } = render(<WorkspaceStateProbe />);

    await waitFor(() =>
      expect(onReady).toHaveBeenCalledWith(expect.anything())
    );
    onReady.mockClear();
    onRender.mockClear();
    fireEvent.click(getByRole("button", { name: "Toggle sidebar" }));

    expect(onReady).not.toHaveBeenCalled();
    expect(onRender).not.toHaveBeenCalled();
  });
});
