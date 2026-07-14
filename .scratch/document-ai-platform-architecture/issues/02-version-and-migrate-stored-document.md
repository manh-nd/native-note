# 02 — Version and migrate StoredDocument

**What to build:** Make every persisted Page document explicitly versioned and validated while preserving all existing content and block links, so future editor schema changes can be migrated safely.

**Blocked by:** 01 — Lock quality baseline and domain language.

**Status:** ready-for-agent

- [ ] Existing Page documents are recognized as the first stored schema version without losing formatting or stable block IDs.
- [ ] Documents missing required stable IDs receive IDs during migration while existing IDs remain unchanged.
- [ ] Reads apply ordered migrations until the latest schema version is reached.
- [ ] Migration is idempotent and covered by representative document fixtures.
- [ ] Invalid or unsupported document structures return an actionable error instead of being stored as arbitrary JSON.
- [ ] Plain text is derived deterministically from validated canonical document content on the server.
- [ ] Existing Findings, LearningItems, practice sessions, and practice attempts remain unchanged.
