# 14 — Expose Skills for block, Page, and editor menus

**What to build:** Make published Skills discoverable from the editor surfaces where their configured scope is valid, including block, Page, selection, and slash-menu workflows.

**Blocked by:** 13 — Run a Skill on selection through a DocumentProposal.

**Status:** ready-for-human

- [x] Menu-visible Skills appear in the selection menu only when a compatible selection exists.
- [x] Block-scoped Skills appear in the block menu only for supported non-empty blocks.
- [x] Slash commands list published menu-visible Skills and support searching by name.
- [x] Page-scoped Skills can be run against the current Page with an explicit context summary and content revision.
- [x] Hidden, draft, archived, inaccessible, or incompatible Skills do not appear in menus.
- [x] Block and Page modifying Skills create DocumentProposals and never mutate content directly.
- [x] Desktop and mobile end-to-end tests cover discovery, invocation, preview, and acceptance from the supported surfaces.
