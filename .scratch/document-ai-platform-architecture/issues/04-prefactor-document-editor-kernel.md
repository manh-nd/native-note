# 04 — Prefactor document-editor kernel

**What to build:** Concentrate schema knowledge, block identity, portable excerpts, and document operations behind the document-editor public interface, so the same operation batch can be validated and applied in the browser or headlessly on the server.

**Blocked by:** 02 — Version and migrate StoredDocument.

**Status:** ready-for-agent

- [ ] Business modules no longer need to import Tiptap or ProseMirror to inspect or mutate documents.
- [ ] The shared document schema can be instantiated without React NodeViews or a browser EditorView.
- [ ] Replace text, insert blocks after a target, set allowed block attributes, and delete blocks are exposed through one operation interface.
- [ ] Persisted targets use block ID, block-relative offsets, expected text, and content revision rather than ProseMirror positions.
- [ ] Portable excerpts retain supported block type, stable ID, text, relevant attributes, and nesting path.
- [ ] Client and headless application produce identical documents for the same operation fixtures.
- [ ] Operation batches are atomic, preserve supported nested structures and marks, and become one undo step in a live editor.
- [ ] Tests exercise only package entrypoints and pass package-boundary validation.
