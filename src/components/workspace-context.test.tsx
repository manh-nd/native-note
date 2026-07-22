import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { ReactNode } from "react";
import {
  WorkspaceProvider,
  useWorkspaceState,
  useWorkspaceDispatch,
  useWorkspaceActions,
} from "./workspace-context";

describe("WorkspaceContext & Reducer", () => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <WorkspaceProvider initialActivePageId="page-123" initialView="write">
      {children}
    </WorkspaceProvider>
  );

  it("provides initial state", () => {
    const { result } = renderHook(() => useWorkspaceState(), { wrapper });
    expect(result.current.activePageId).toBe("page-123");
    expect(result.current.view).toBe("write");
    expect(result.current.skillDrawerOpen).toBe(false);
    expect(result.current.pendingProposalId).toBeNull();
  });

  it("handles SELECT_PAGE action", () => {
    const { result } = renderHook(
      () => ({
        state: useWorkspaceState(),
        actions: useWorkspaceActions(),
      }),
      { wrapper }
    );

    act(() => {
      result.current.actions.selectPage("page-456");
    });

    expect(result.current.state.activePageId).toBe("page-456");
  });

  it("handles SET_VIEW action", () => {
    const { result } = renderHook(
      () => ({
        state: useWorkspaceState(),
        actions: useWorkspaceActions(),
      }),
      { wrapper }
    );

    act(() => {
      result.current.actions.setView("practice");
    });

    expect(result.current.state.view).toBe("practice");
  });

  it("handles TOGGLE_SKILL_DRAWER action", () => {
    const { result } = renderHook(
      () => ({
        state: useWorkspaceState(),
        actions: useWorkspaceActions(),
      }),
      { wrapper }
    );

    act(() => {
      result.current.actions.setSkillDrawerOpen(true);
    });
    expect(result.current.state.skillDrawerOpen).toBe(true);

    act(() => {
      result.current.actions.setSkillDrawerOpen(false);
    });
    expect(result.current.state.skillDrawerOpen).toBe(false);
  });

  it("handles SET_PENDING_PROPOSAL action", () => {
    const { result } = renderHook(
      () => ({
        state: useWorkspaceState(),
        actions: useWorkspaceActions(),
      }),
      { wrapper }
    );

    act(() => {
      result.current.actions.setPendingProposalId("prop-999");
    });

    expect(result.current.state.pendingProposalId).toBe("prop-999");
  });
});
