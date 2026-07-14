# 19 — Require approval for Agent-created LearningItems

**What to build:** Allow an Agent to recommend new LearningItems while requiring an explicit user decision and preserving the automatic learning behavior of accepted pedagogical Findings.

**Blocked by:** 09 — Migrate Review Findings and LearningItems to DocumentProposals; 16 — Run a manual read-only Agent with the Tool registry.

**Status:** ready-for-agent

- [ ] An Agent with the allowed Tool can create a pending LearningItem recommendation with source evidence and explanation.
- [ ] Direct Agent recommendations require user approval before becoming active LearningItems.
- [ ] Rejecting a recommendation creates no LearningItem.
- [ ] Approval enforces ownership, validates the recommendation, and is idempotent.
- [ ] Retries or repeated approvals cannot create duplicate LearningItems.
- [ ] LearningItems derived atomically from accepted pedagogical Findings continue to require no second approval.
- [ ] Run and Tool-call audit records show the recommendation and final user decision without leaking sensitive context.
