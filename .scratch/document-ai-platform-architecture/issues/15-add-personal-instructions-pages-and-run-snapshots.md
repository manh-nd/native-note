# 15 — Add personal Instructions Pages and run snapshots

**What to build:** Let a user select one Page as active personal Instructions so ordinary AI Actions consistently follow their preferences and each run remains traceable to the exact instructions used.

**Blocked by:** 06 — Apply selection rewrite through a canonical DocumentProposal; 11 — Mark and manage Skill Pages.

**Status:** ready-for-agent

- [ ] A user can designate an owned Page as active personal Instructions.
- [ ] Multiple candidate Instructions Pages may exist, but only one is active at a time.
- [ ] Switching active Instructions is atomic and does not delete or rewrite either Page.
- [ ] Ordinary AI Actions include the active Instructions content in their context.
- [ ] Every applicable AI run records the Instructions Page, content revision, and immutable snapshot used.
- [ ] Missing or deleted active Instructions fall back safely without blocking ordinary AI Actions.
- [ ] Personal Instructions are not implicitly applied to custom Agents.
- [ ] The settings UI shows and allows changing the active Instructions Page.
