# 20 — Run scheduled Agents into a proposal inbox

**What to build:** Let a user schedule a custom Agent for background work while ensuring failures are observable and every proposed Page change waits in an inbox for explicit approval.

**Blocked by:** 17 — Add Agent cancellation, retries, and run history; 18 — Let an Agent create a DocumentProposal; 19 — Require approval for Agent-created LearningItems.

**Status:** ready-for-agent

- [ ] A user can enable, disable, and configure a schedule for an owned custom Agent.
- [ ] Duplicate or retried schedule delivery is idempotent and cannot create duplicate Agent runs or outputs.
- [ ] Scheduled runs use the same step limit, Tool policies, cancellation, retry, redaction, and audit behavior as manual runs.
- [ ] Every scheduled Page write produces a pending DocumentProposal and is never auto-accepted.
- [ ] Pending scheduled proposals appear in an owned proposal inbox with Agent, Page, summary, age, and stale status.
- [ ] Users can open, preview, accept, reject, or regenerate inbox proposals through the standard proposal workflow.
- [ ] Scheduled Agent failures are visible in run history with a safe retry path.
- [ ] Direct LearningItem recommendations from scheduled Agents retain their approval requirement.
- [ ] End-to-end coverage proves that a scheduled Agent can run, create an inbox proposal, and leave Page content unchanged until acceptance.
