# 17 — Add Agent cancellation, retries, and run history

**What to build:** Give users operational control and visibility over manual Agent runs, including cancellation, safe retry, bounded failures, and inspectable run history.

**Blocked by:** 16 — Run a manual read-only Agent with the Tool registry.

**Status:** ready-for-agent

- [ ] A running Agent can be cancelled and reaches a terminal cancelled state without executing further Tools.
- [ ] Transient provider failures follow a bounded retry policy while permanent failures stop immediately with a safe error.
- [ ] Retrying a run uses idempotency controls so completed Tool side effects cannot be duplicated.
- [ ] Step-limit exhaustion is distinguishable from cancellation and provider failure.
- [ ] Users can view Agent run status, timing, model snapshot, steps, Tool calls, and redacted failures.
- [ ] Run history enforces ownership and never exposes provider credentials or raw sensitive errors.
- [ ] Automated tests cover cancellation during model work, cancellation between Tool calls, retries, duplicate requests, and every terminal status.
