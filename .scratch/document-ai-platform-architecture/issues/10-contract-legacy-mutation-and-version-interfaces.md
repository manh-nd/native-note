# 10 — Contract legacy AI mutation and Page version interfaces

**What to build:** Finish the expand-contract migration by removing obsolete mutation protocols and legacy Page version behavior after every current user flow uses content revisions and DocumentProposals.

**Blocked by:** 08 — Migrate block AI Actions to DocumentProposals; 09 — Migrate Review Findings and LearningItems to DocumentProposals.

**Status:** ready-for-agent

- [ ] No current UI or application workflow calls the legacy transform decision or Finding mutation protocol.
- [ ] No content conflict or AI stale check depends on the legacy Page version.
- [ ] Legacy compatibility fields, branches, and routes are removed rather than maintained indefinitely.
- [ ] Database constraints and indexes reflect the final content-revision and proposal model.
- [ ] Review, selection, and block AI flows pass their complete end-to-end scenarios after contraction.
- [ ] Typecheck, tests, lint, package boundaries, production build, and desktop/mobile end-to-end tests pass without compatibility flags.
