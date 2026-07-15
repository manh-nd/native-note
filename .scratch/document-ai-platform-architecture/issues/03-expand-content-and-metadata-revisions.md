# 03 — Expand content and metadata revisions

**What to build:** Introduce independent Page content and metadata revisions beside the legacy Page version, so new callers can distinguish document conflicts from title or tree changes while old callers continue to work during migration.

**Blocked by:** 02 — Version and migrate StoredDocument.

**Status:** ready-for-agent

- [x] Existing Pages are backfilled with content and metadata revisions without changing their content.
- [x] A content mutation increments only the content revision.
- [x] A title, parent, or position mutation increments only the metadata revision.
- [x] New content and metadata mutation contracts enforce their corresponding expected revision and return conflict responses on mismatch.
- [x] Legacy version behavior remains available during the expand phase so all existing user flows stay green.
- [x] Page read responses expose the new revisions required by later callers.
- [x] Integration tests prove that a metadata edit does not invalidate an unchanged content revision.
