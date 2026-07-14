# 13 — Run a Skill on selection through a DocumentProposal

**What to build:** Let a writer run a published selection-scoped Skill and review its result through the same safe proposal workflow used by built-in AI Actions.

**Blocked by:** 07 — Complete DocumentProposal lifecycle and conflicts; 12 — Publish and rollback immutable Skill versions.

**Status:** ready-for-agent

- [ ] A published selection-scoped Skill can be invoked for a non-empty supported selection.
- [ ] The run records the exact Skill version, input snapshot, content revision, model, and applicable policies.
- [ ] A modifying Skill creates validated DocumentProposal operations rather than returning raw document JSON.
- [ ] Preview, accept, reject, stale, reload, and undo behavior matches built-in selection AI Actions.
- [ ] A read-only Skill returns a result without creating a DocumentProposal.
- [ ] Draft-only, archived, invalid-scope, or inaccessible Skills cannot run.
- [ ] Skill runs respect the configured approval and output mode while retaining mandatory approval for Page writes.
