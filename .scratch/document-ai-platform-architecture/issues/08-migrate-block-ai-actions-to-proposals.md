# 08 — Migrate block AI Actions to DocumentProposals

**What to build:** Give block-level improve, rewrite, shorten, expand, and insert behaviors the same durable preview and acceptance workflow as selection rewrites.

**Blocked by:** 07 — Complete DocumentProposal lifecycle and conflicts.

**Status:** ready-for-agent

- [ ] Every block action that changes content creates a pending DocumentProposal rather than holding an ephemeral replacement in component state.
- [ ] Replace behavior targets the selected block with expected text and revision validation.
- [ ] Insert behavior uses validated insert-block operations and preserves stable IDs and supported structure.
- [ ] Block proposal preview, accept, reject, stale, undo, and reload behavior matches the selection workflow.
- [ ] Explain and phrase actions remain read-only and create neither a DocumentProposal nor a document mutation.
- [ ] Generic block transformations do not create LearningItems automatically.
- [ ] Existing block menu behavior remains accessible on desktop and mobile.
