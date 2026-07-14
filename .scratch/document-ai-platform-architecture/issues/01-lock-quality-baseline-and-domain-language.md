# 01 — Lock quality baseline and domain language

**What to build:** Establish a trustworthy green baseline and one shared vocabulary before the architecture changes begin, so subsequent tickets can distinguish Page content, Review findings, DocumentProposals, LearningItems, Skills, Instructions, and Agents consistently.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Generated development and test artifacts are excluded from lint without hiding repository source.
- [ ] All current source-level lint violations are resolved.
- [ ] Typecheck, unit tests, lint, package-boundary checks, and production build pass from a clean checkout.
- [ ] The domain glossary defines Page, StoredDocument, Review, Finding, DocumentProposal, LearningItem, Skill, Instructions, Agent, AgentRun, and ToolCall.
- [ ] The glossary explicitly avoids using Correction as a synonym for Finding or DocumentProposal.
- [ ] Architectural decisions record single-user JSON snapshot persistence, server-canonical proposal application, and Tiptap as the document-editor implementation.
