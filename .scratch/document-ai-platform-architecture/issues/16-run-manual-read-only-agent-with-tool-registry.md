# 16 — Run a manual read-only Agent with the Tool registry

**What to build:** Let a user define and manually run a bounded custom Agent that can read the current Page and relevant learning memory through validated, authorized, and audited Tools.

**Blocked by:** 12 — Publish and rollback immutable Skill versions; 15 — Add personal Instructions Pages and run snapshots.

**Status:** ready-for-agent

- [ ] A user can create an Agent definition with its own Instructions Page, published Skill allowlist, Tool allowlist, model policy, and maximum steps.
- [ ] The initial Tool registry validates names, descriptions, input/output schemas, ownership requirements, risk, approval policy, and executor results.
- [ ] The Agent can call read-current-Page and search-learning-memory Tools only when they are allowed.
- [ ] Every Tool input is validated and ownership-checked before execution.
- [ ] The Agent stops after at most six steps and records a clear terminal status.
- [ ] Agent, model, Instructions, Skill, and Tool configuration snapshots are recorded on the run.
- [ ] Tool-call inputs, outputs, timing, failures, and approval state are audited with secrets redacted.
- [ ] A read-only run cannot create a DocumentProposal, LearningItem, or direct database mutation outside its Tools.
