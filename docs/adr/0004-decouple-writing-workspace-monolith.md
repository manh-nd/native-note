# Decouple Writing Workspace monolith into deep sub-modules

NativeNote will decompose the 2,081-line `writing-workspace.tsx` God Component into six co-located deep sub-modules (Page Navigation, Editor Sync, Proposal Orchestration, Skill Studio, Editor Navigation Hooks, and Client Data Adapter).

## Context and Problem

The `writing-workspace.tsx` component previously handled six distinct domain responsibilities (Page navigation, Tiptap canonical document autosave, AI DocumentProposal conflict resolution, Skill authoring inline forms, slash menu keyboard events, and Review Findings dismissal) behind 20 `useState` hooks, 34 handlers, and 20+ direct inline `api()` fetch calls. This conflation broke locality, caused duplication between Selection AI and Block AI proposal paths, and made UI unit testing difficult without global network mocks.

## Decision

1. **Workspace State & Event Flow**: Introduce an internal `WorkspaceProvider` with a `useReducer` action dispatch pattern paired with specialized custom hooks (`useEditorSync`, `useProposalOrchestrator`, `useSkillConfig`).
2. **Unified DocumentProposal Seam**: Consolidate Selection AI, Block AI, Page AI, and Agent AI proposal paths into a single `useProposalOrchestrator` hook, a single `PendingProposal` data model, and a single ProseMirror diff preview engine.
3. **Notion-inspired Skill Studio UI**: Replace inline 140-line header forms with a dynamic Breadcrumb topbar, a compact Property Bar (chips) under the title, a dedicated **Skill Studio Side Peek Drawer** (containing Policy Configuration, Test Sandbox, and Version History), and `AI Skill` badges in the sidebar.
4. **Editor Navigation Encapsulation**: Move slash command (`/`) keyboard listening and text selection float positioning into `useSlashMenu` and `useSelectionBubbleMenu` custom hooks.
5. **Client Data Adapter Seam**: Extract an explicit `src/lib/client-api/` adapter seam providing `HttpWorkspaceApiClient` for production and `InMemoryWorkspaceApiClient` for headless UI testing.
