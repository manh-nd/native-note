# 12 — Publish and rollback immutable Skill versions

**What to build:** Allow users to edit Skill instructions as a draft Page and deliberately publish or roll back immutable runtime versions, so experimentation cannot silently change active behavior.

**Blocked by:** 11 — Mark and manage Skill Pages.

**Status:** ready-for-agent

- [ ] Publishing compiles the current Skill Page and structured metadata into an immutable Skill version.
- [ ] Runtime configuration references a published version rather than mutable draft content.
- [ ] Editing the draft after publication does not change the active published version.
- [ ] Compilation rejects empty, oversized, inaccessible, or unsupported configurations with actionable feedback.
- [ ] Published versions record instruction snapshot, normalized policy, compiler version, and publication metadata.
- [ ] A user can activate an earlier valid version without deleting later versions.
- [ ] Version history shows which version is active and when each version was published.
- [ ] Publish and rollback operations enforce ownership and are idempotent.
