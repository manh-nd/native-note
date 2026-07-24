# 0009. Consolidate DocumentProposal Engine Deep Module Seam

- **Status**: Accepted
- **Date**: 2026-07-24
- **Deciders**: Manh Nguyen, Antigravity AI

---

## Context and Problem Statement

The `document-proposals` package (`src/packages/document-proposals/`) previously exported over 20 standalone functions and 4 uncoordinated internal modules (`ProposalDecisionEngine`, `ProposalDiffApplier`, `ReviewFindingAuditLog`, `InMemoryProposalStore`). Callers such as UI hooks (`useProposalOrchestrator`) and API handlers were forced to manually orchestrate decision state transitions, version conflict checks, diff applications, audit log entries, and store persistence across separate calls. This caused domain logic leakage into the UI layer and created a shallow, fragmented interface seam.

---

## Decision Drivers

- **Codebase Design & Deep Modules**: Encapsulate complex multi-step proposal lifecycle operations behind a single deep interface seam (`DocumentProposalEngine`).
- **Atomic Operation Boundary**: Ensure `acceptProposal` and `rejectProposal` perform state verification, version conflict checks, diff application, audit trail recording, and store persistence atomically.
- **UI Domain Decoupling**: Refactor `useProposalOrchestrator` to act as a thin React view adapter around `DocumentProposalEngine`, hiding raw state mutation and exposing semantic actions (`accept`, `reject`, `showPreview`, `clearPreview`).
- **Encapsulated Public Entry Points**: Restrict `src/packages/document-proposals/index.ts` to export only `DocumentProposalEngine`, `createDocumentProposalEngine()`, `InMemoryProposalStore`, and core domain types, making individual internal modules private implementation details in `lib/`.

---

## Decision Outcome

We decided to:

1. Create `DocumentProposalEngine` in `src/packages/document-proposals/lib/document-proposal-engine.ts` uniting state transitions, diff application, audit logging, and store persistence into a single deep module.
2. Provide `createDocumentProposalEngine()` factory and dependency injection for store and audit log adapters.
3. Update `useProposalOrchestrator` to consume `DocumentProposalEngine` directly.
4. Restrict `src/packages/document-proposals/index.ts` exports to expose only the deep module seam and hide sub-object internals.
