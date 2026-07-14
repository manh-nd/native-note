# 05 — Isolate editor session and migrate autosave

**What to build:** Keep the writing experience unchanged while isolating the live editor from unrelated workspace state and moving content autosave to the new content revision contract.

**Blocked by:** 03 — Expand content and metadata revisions; 04 — Prefactor document-editor kernel.

**Status:** ready-for-agent

- [ ] Typing, formatting, block controls, deep links, selection menus, and undo/redo retain their current behavior on desktop and mobile.
- [ ] Sidebar, practice, live-coach, and unrelated dialog state no longer cause the editor session to rerender unnecessarily.
- [ ] Content autosave submits the expected content revision and advances only that revision.
- [ ] Title and Page-tree mutations use metadata revisions and do not advance the content revision.
- [ ] Pending content saves are flushed before switching Pages or starting an AI request.
- [ ] Autosave conflicts are surfaced without silently overwriting newer content.
- [ ] Normal typing does not mirror full document JSON into a second client state store.
- [ ] Performance-oriented tests or instrumentation demonstrate that unrelated workspace state does not rerender the editor.
