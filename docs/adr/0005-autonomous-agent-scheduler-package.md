# 0005. Autonomous Agent Scheduler Deep Package & Proposal Inbox

- **Status**: Accepted
- **Date**: 2026-07-22
- **Deciders**: Manh Nguyen, AI Agentic Pair

---

## Context and Problem Statement

File `src/components/agent-automation-panel.tsx` (821 lines / 28KB) mixes UI modal rendering with direct fetch API calls to `/api/agents/schedules` and `/api/proposals`. Scheduled agent runs lack robust exponential backoff retry durability, making background AI execution vulnerable to transient API errors (e.g. rate limits or network hiccups).

---

## Decision Drivers

- **Deep Module Architecture**: Move core scheduling, execution state, and durable retry logic into a new deep package `src/packages/agent-scheduler/`.
- **Durable Retry Loop**: Implement Exponential Backoff retry (up to 3 attempts) for transient failures (429/500 errors).
- **Decoupled UI Components**: Split `agent-automation-panel.tsx` into modular UI components under `src/components/agent-scheduler/`: `<AgentScheduleList />` and `<ScheduledProposalInbox />`.

---

## Decision Outcome

We decided to:

1. Create `src/packages/agent-scheduler/` exporting `AgentSchedulerEngine` and `useAgentScheduler()` hook.
2. Implement durable exponential backoff retry engine for scheduled agent runs.
3. Extract UI into `<AgentScheduleList />` and `<ScheduledProposalInbox />`.
4. Refactor `agent-automation-panel.tsx` down to a thin wrapper shell.
5. Create parent Spec Issue #11 and 4 tracer-bullet GitHub Issues (#12, #13, #14, #15).
