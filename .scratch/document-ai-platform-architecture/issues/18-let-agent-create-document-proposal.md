# 18 — Let an Agent create a DocumentProposal

**What to build:** Allow a custom Agent to propose a Page edit through a controlled Tool while preserving the same preview, stale detection, acceptance, and undo guarantees as every other AI-generated change.

**Blocked by:** 07 — Complete DocumentProposal lifecycle and conflicts; 16 — Run a manual read-only Agent with the Tool registry.

**Status:** ready-for-agent

- [ ] An Agent with the allowed Tool can submit validated document operations against a Page content revision.
- [ ] The Tool creates a pending DocumentProposal and never applies Page content directly.
- [ ] The proposal records the Agent run, Tool call, creator, operation batch, and base content revision.
- [ ] Users can open the Agent result, preview it in the editor, accept or reject it, undo an accepted change, and reload the Page safely.
- [ ] Unauthorized, invalid, stale, or disallowed operation requests fail without creating a proposal.
- [ ] Agent instructions or trust settings cannot bypass mandatory document approval.
- [ ] Retried Agent runs do not create duplicate proposals for the same idempotency key.
