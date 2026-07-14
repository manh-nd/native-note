# 06 — Apply selection rewrite through a canonical DocumentProposal

**What to build:** Let a writer improve selected text through a persisted DocumentProposal that is previewed without mutation, committed canonically on the server, and synchronized into the editor as one undoable change.

**Blocked by:** 05 — Isolate editor session and migrate autosave.

**Status:** ready-for-agent

- [ ] A selection AI rewrite creates an Agent-independent AI run and a pending DocumentProposal against the current content revision.
- [ ] The proposal contains validated replace-text operations with exact block targets and expected text.
- [ ] The current inline diff preview is rendered from persisted proposal operations without modifying Page content.
- [ ] Accepting the proposal applies operations headlessly and updates canonical document content, plain text, content revision, and proposal status in one transaction.
- [ ] The client synchronizes the committed result without issuing a duplicate autosave.
- [ ] The accepted change is one editor undo step, and undo subsequently autosaves as a normal user edit.
- [ ] A failed server transaction leaves both the Page and proposal unchanged.
- [ ] Desktop and mobile end-to-end coverage verifies select, preview, accept, undo, and reload.
