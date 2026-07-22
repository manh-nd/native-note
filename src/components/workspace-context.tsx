"use client";

import React, {
  createContext,
  useContext,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode,
} from "react";

export type WorkspaceView = "write" | "practice" | "live";

export type WorkspaceState = {
  activePageId: string;
  view: WorkspaceView;
  skillDrawerOpen: boolean;
  pendingProposalId: string | null;
};

export type WorkspaceAction =
  | { type: "SELECT_PAGE"; pageId: string }
  | { type: "SET_VIEW"; view: WorkspaceView }
  | { type: "SET_SKILL_DRAWER_OPEN"; open: boolean }
  | { type: "SET_PENDING_PROPOSAL"; proposalId: string | null };

const WorkspaceStateContext = createContext<WorkspaceState | null>(null);
const WorkspaceDispatchContext =
  createContext<Dispatch<WorkspaceAction> | null>(null);

function workspaceReducer(
  state: WorkspaceState,
  action: WorkspaceAction
): WorkspaceState {
  switch (action.type) {
    case "SELECT_PAGE":
      return {
        ...state,
        activePageId: action.pageId,
      };
    case "SET_VIEW":
      return {
        ...state,
        view: action.view,
      };
    case "SET_SKILL_DRAWER_OPEN":
      return {
        ...state,
        skillDrawerOpen: action.open,
      };
    case "SET_PENDING_PROPOSAL":
      return {
        ...state,
        pendingProposalId: action.proposalId,
      };
    default:
      return state;
  }
}

export type WorkspaceProviderProps = {
  children: ReactNode;
  initialActivePageId: string;
  initialView?: WorkspaceView;
};

export function WorkspaceProvider({
  children,
  initialActivePageId,
  initialView = "write",
}: WorkspaceProviderProps) {
  const [state, dispatch] = useReducer(workspaceReducer, {
    activePageId: initialActivePageId,
    view: initialView,
    skillDrawerOpen: false,
    pendingProposalId: null,
  });

  return (
    <WorkspaceStateContext.Provider value={state}>
      <WorkspaceDispatchContext.Provider value={dispatch}>
        {children}
      </WorkspaceDispatchContext.Provider>
    </WorkspaceStateContext.Provider>
  );
}

export function useWorkspaceState(): WorkspaceState {
  const context = useContext(WorkspaceStateContext);
  if (!context) {
    throw new Error(
      "useWorkspaceState phải được dùng bên trong WorkspaceProvider"
    );
  }
  return context;
}

export function useWorkspaceDispatch(): Dispatch<WorkspaceAction> {
  const context = useContext(WorkspaceDispatchContext);
  if (!context) {
    throw new Error(
      "useWorkspaceDispatch phải được dùng bên trong WorkspaceProvider"
    );
  }
  return context;
}

export function useWorkspaceActions() {
  const dispatch = useWorkspaceDispatch();

  return useMemo(
    () => ({
      selectPage: (pageId: string) => dispatch({ type: "SELECT_PAGE", pageId }),
      setView: (view: WorkspaceView) => dispatch({ type: "SET_VIEW", view }),
      setSkillDrawerOpen: (open: boolean) =>
        dispatch({ type: "SET_SKILL_DRAWER_OPEN", open }),
      setPendingProposalId: (proposalId: string | null) =>
        dispatch({ type: "SET_PENDING_PROPOSAL", proposalId }),
    }),
    [dispatch]
  );
}
