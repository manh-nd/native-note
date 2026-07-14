# 09 — Migrate Review Findings and LearningItems to DocumentProposals

**What to build:** Make full-Page Review findings use exact proposal targets and atomic learning decisions, so Apply, Save, Dismiss, and stale behavior remain correct even when text is repeated or content changes.

**Blocked by:** 07 — Complete DocumentProposal lifecycle and conflicts.

**Status:** ready-for-agent

- [ ] A Review records its AI run, Page content revision, snapshot, and pedagogical Findings.
- [ ] A Finding that can change text links to a DocumentProposal with exact block-relative targets.
- [ ] Apply commits the Page change, proposal decision, Finding decision, and eligible LearningItem atomically.
- [ ] Save creates an eligible LearningItem without changing Page content.
- [ ] Dismiss creates no LearningItem and changes no Page content.
- [ ] A failed or stale Apply creates no LearningItem and leaves canonical content unchanged.
- [ ] Multiple identical phrases in a Page apply to their intended blocks and offsets.
- [ ] Existing LearningItems and practice behavior remain compatible after migration.
- [ ] Multi-Finding and multi-segment decisions are idempotent and do not create duplicate LearningItems.
