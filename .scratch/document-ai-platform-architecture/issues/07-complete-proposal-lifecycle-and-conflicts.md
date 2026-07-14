# 07 — Complete DocumentProposal lifecycle and conflicts

**What to build:** Make pending proposals durable and conflict-safe, so writers can reload, reject, regenerate, or recover without an AI change ever targeting the wrong text.

**Blocked by:** 06 — Apply selection rewrite through a canonical DocumentProposal.

**Status:** ready-for-agent

- [ ] Pending proposals can be loaded and previewed again after Page reload.
- [ ] Rejecting a proposal is idempotent and never changes Page content.
- [ ] Repeating an accepted or rejected decision returns the existing result without duplicating side effects.
- [ ] A changed content revision or mismatched target marks a pending proposal stale and prevents acceptance.
- [ ] Repeated source text in different blocks is resolved by stable block target rather than first text occurrence.
- [ ] Editing while an AI request is running produces a stale result instead of overwriting the edit.
- [ ] The editor prevents local mutation during the final acceptance request and recovers to canonical server content if reconciliation fails.
- [ ] Users receive an actionable regenerate path for stale proposals.
