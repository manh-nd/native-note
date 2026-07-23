# 0008. Personal Instructions Priority Engine & Lifecycle Manager Package

- **Status**: Accepted
- **Date**: 2026-07-23
- **Deciders**: Manh Nguyen, AI Agentic Pair

---

## Context and Problem Statement

Personal instructions (`src/packages/instructions/`) allow users to guide AI agent behavior at the page or workspace scope. Currently, the package is a shallow 14-line helper that lacks cascading priority resolution, validation error handling, and in-memory test seams.

---

## Decision Drivers

- **Deep Module Architecture**: Refactor `src/packages/instructions/` into 3 deep sub-modules: `InstructionsCompiler` (prompt compilation & policy validation), `InstructionPriorityResolver` (cascading page > workspace priority resolution), and `InstructionAuditTrail` (tracking instruction changes).
- **Validation & Exception Handling**: Throw `InstructionValidationError` when instruction text exceeds length policies or contains invalid markup.
- **Headless Test Runner**: Provide `InMemoryInstructionStore` adapter for fast unit testing of instruction compilation without database dependencies.

---

## Decision Outcome

We decided to:

1. Create `src/packages/instructions/lib/instructions-compiler.ts`, `instruction-priority-resolver.ts`, and `in-memory-instruction-store.ts`.
2. Implement `InstructionValidationError` for policy compliance.
3. Provide `InMemoryInstructionStore` adapter for headless testing.
4. Create Parent Spec Issue #26 and 4 tracer-bullet GitHub Issues (#27, #28, #29, #30).
