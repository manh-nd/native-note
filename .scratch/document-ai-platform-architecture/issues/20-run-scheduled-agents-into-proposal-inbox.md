# 20 — Run scheduled Agents into a proposal inbox

**What to build:** Let a user schedule a custom Agent for background work while ensuring failures are observable and every proposed Page change waits in an inbox for explicit approval.

**Blocked by:** 17 — Add Agent cancellation, retries, and run history; 18 — Let an Agent create a DocumentProposal; 19 — Require approval for Agent-created LearningItems.

**Status:** ready-for-human

- [x] A user can enable, disable, and configure a schedule for an owned custom Agent.
- [x] Duplicate or retried schedule delivery is idempotent and cannot create duplicate Agent runs or outputs.
- [x] Scheduled runs use the same step limit, Tool policies, cancellation, retry, redaction, and audit behavior as manual runs.
- [x] Every scheduled Page write produces a pending DocumentProposal and is never auto-accepted.
- [x] Pending scheduled proposals appear in an owned proposal inbox with Agent, Page, summary, age, and stale status.
- [x] Users can open, preview, accept, reject, or regenerate inbox proposals through the standard proposal workflow.
- [x] Scheduled Agent failures are visible in run history with a safe retry path.
- [x] Direct LearningItem recommendations from scheduled Agents retain their approval requirement.
- [x] End-to-end coverage proves that a scheduled Agent can run, create an inbox proposal, and leave Page content unchanged until acceptance.

## Comments

- Implemented owned Agent schedules, idempotent ScheduleDelivery dispatch/recovery, the scheduled proposal inbox, and explicit retry paths for AgentRun and pre-run delivery failures.
- Scheduled execution reuses the canonical Agent runtime and proposal workflow; Page content remains unchanged until proposal acceptance.
