# 0007. Document Proposal Decision Engine & Review Finding Audit Log Package

- **Status**: Accepted
- **Date**: 2026-07-23
- **Deciders**: Manh Nguyen, AI Agentic Pair

---

## Context and Problem Statement

Document proposals (`src/packages/document-proposals/`) represent suggested edits created by autonomous agents. Currently, proposal decision logic, review finding audit trails, and atomic diff applications lack isolated transaction boundaries and explicit rollback error handling when document version conflicts occur.

---

## Decision Drivers

- **Deep Module Architecture**: Refactor `src/packages/document-proposals/` into 3 deep sub-modules: `ProposalDecisionEngine` (decision state transitions), `ProposalDiffApplier` (atomic diff application & rollback), and `ReviewFindingAuditLog` (immutable decision trail).
- **Atomic Rollback & Version Safety**: Raise `ProposalConflictError` and perform automatic rollback if document contents change prior to proposal application.
- **Headless Test Runner**: Provide `InMemoryProposalStore` adapter for fast unit testing of proposal decisions and audit logs without DB connection overhead.

---

## Decision Outcome

We decided to:

1. Create `src/packages/document-proposals/lib/proposal-decision-engine.ts`, `proposal-diff-applier.ts`, and `review-finding-audit-log.ts`.
2. Implement `ProposalConflictError` for version mismatch protection.
3. Provide `InMemoryProposalStore` adapter for headless testing.
4. Create Parent Spec Issue #21 and 4 tracer-bullet GitHub Issues (#22, #23, #24, #25).
