# NativeNote Document and AI Platform Architecture

Status: ready-for-agent

## Problem Statement

NativeNote already provides a capable Tiptap writing experience, structured Gemini feedback, AI previews, learning memory, practice, and live coaching. However, the editor, page lifecycle, AI actions, review workflow, persistence, and proposal UI are currently coordinated from one large client module and through several different mutation protocols. This makes similar AI behaviors behave differently depending on whether they started from a block, a selection, or a full-page review.

The current acceptance flow can also record an AI change and create learning memory before the canonical document has actually been changed. Text-based mutation targeting can select the wrong occurrence when the same phrase appears more than once. In addition, document JSON has no explicit schema version, and the same Page version is used for both document content and unrelated metadata. These weaknesses will become more expensive as Skills and Agents are added.

The existing architectural proposal correctly treats Tiptap as a document engine, but it assumes a greenfield application, introduces a hypothetical editor port, proposes a folder structure that conflicts with this repository's deep-module conventions, and recommends a second AI SDK that NativeNote does not need. NativeNote needs an incremental but redesign-friendly architecture that preserves its working product capabilities, fixes correctness issues first, and supplies stable interfaces for Skills and Agents.

## Solution

NativeNote will organize document editing, AI coaching, learning, Skills, and Agents as capability-oriented deep modules with small public interfaces. Tiptap and ProseMirror will remain the document implementation inside the document-editor module, while application workflows exchange versioned document snapshots, stable selection snapshots, portable excerpts, document operations, and persisted proposals.

All AI-generated Page mutations will follow one workflow: an AI Action, Review, Skill, or Agent creates a validated DocumentProposal against a specific content revision; the user previews it; and the server applies the proposal to the canonical document and commits the document, proposal status, pedagogical Finding decisions, and eligible LearningItems atomically. The client then synchronizes the committed change into the live editor as a single undoable transaction.

Page content will have an explicit document schema version and a content revision independent from Page metadata. Existing Pages will be migrated without replacing stable block IDs. Skills will follow a Notion-like user experience: any Page can be marked as a Skill and edited in the normal Page editor. For runtime safety, published immutable Skill versions will be compiled from the draft Page. A personal Instructions Page will provide always-on preferences, while each custom Agent will have its own Instructions Page, Skill allowlist, Tool allowlist, and execution policy.

NativeNote will continue using `@google/genai`. Structured output and function calling will be wrapped by the existing provider infrastructure, including key pooling, retry, timeout, redaction, and error mapping. The application will own tool validation, authorization, execution, approval, and audit behavior.

## User Stories

1. As a writer, I want my existing Pages to open with the same content and formatting after the architecture migration, so that I do not lose work.
2. As a writer, I want existing block links to continue targeting the same blocks, so that saved deep links remain useful.
3. As a writer, I want document autosave to remain automatic, so that architecture changes do not add manual save work.
4. As a writer, I want title and sidebar changes not to invalidate an AI suggestion about unchanged content, so that unrelated metadata edits do not waste AI work.
5. As a writer, I want concurrent content changes to be detected, so that a stale save cannot silently overwrite newer content.
6. As a writer, I want invalid or obsolete document content to be migrated or rejected with an understandable error, so that corrupted content is not silently persisted.
7. As a writer, I want stable block identity across typing, split, merge, paste, duplicate, undo, and redo, so that AI and deep links continue targeting the intended content.
8. As a writer, I want nested lists, task items, headings, quotes, and code blocks to retain their structure during AI operations, so that an edit does not flatten my document.
9. As a writer, I want an accepted AI change to be one undo step, so that I can reverse it naturally.
10. As a writer, I want undoing an accepted AI change to autosave like a normal edit, so that the canonical Page returns to the state I see.
11. As a writer, I want the editor to stay responsive while I open sidebars, practice views, AI panels, and dialogs, so that unrelated UI state does not cause expensive editor rerenders.
12. As a writer, I want selection formatting and normal editor commands to continue working without going through AI proposal infrastructure, so that direct editing remains immediate.
13. As a writer, I want AI previews to remain ephemeral decorations until I accept them, so that previewing never mutates my document.
14. As a writer, I want a pending proposal to be reopenable after a reload, so that a page refresh does not discard a decision I have not made.
15. As a writer, I want a proposal to become stale when its exact target content changes, so that AI never edits the wrong text.
16. As a writer, I want unrelated content changes to invalidate a proposal only when the proposal's content revision or target validation requires it, so that conflict behavior is safe and predictable.
17. As a writer, I want duplicated phrases in a Page to be edited at the selected block and offset, so that the wrong occurrence is never replaced.
18. As a writer, I want a block AI action and a selection AI action to use the same preview and acceptance behavior, so that the product feels consistent.
19. As a writer, I want full-page Review findings to use the same proposal mechanism as direct AI actions, so that Apply, Save, Dismiss, and stale behavior are consistent.
20. As a writer, I want explanation-only actions to avoid creating document proposals, so that asking for help cannot accidentally modify content.
21. As a writer, I want rewrite, shorten, expand, and tone actions not to create LearningItems automatically, so that generic writing transformations do not pollute my learning queue.
22. As a learner, I want accepting a pedagogical Finding to create a LearningItem, so that corrections I use become part of my learning memory.
23. As a learner, I want to save a pedagogical Finding without applying its rewrite, so that I can remember the lesson while preserving my original prose.
24. As a learner, I want dismissed Findings not to become LearningItems, so that rejected feedback does not appear in practice.
25. As a learner, I want the relationship between a Review, Finding, Proposal, and LearningItem to be auditable, so that I can understand where a practice item came from.
26. As a learner, I want accepting a multi-segment correction to create only eligible pedagogical LearningItems, so that explanation-worthy changes are remembered without treating every changed segment as a lesson.
27. As a learner, I want existing LearningItems and practice history to survive the data migration, so that my progress is preserved.
28. As a learner, I want a failed proposal commit not to create LearningItems, so that learning memory never claims I accepted a change that was not saved.
29. As a user, I want to mark an existing Page as a Skill, so that I can turn useful instructions into a reusable action without moving them to a separate editor.
30. As a user, I want to create a new Skill as a normal Page, so that Skill authoring uses the familiar NativeNote editor.
31. As a user, I want a marked Skill Page to remain organizable in the workspace Page tree, so that Skills can live with related notes and references.
32. As a user, I want to unmark a Page as a Skill without deleting the Page, so that I can stop exposing a workflow while keeping its content.
33. As a user, I want Skill metadata such as scope, output mode, tool access, status, and menu visibility to be managed explicitly, so that formatting changes in the Page cannot alter runtime policy accidentally.
34. As a user, I want to edit a Skill Page as a draft without changing the currently published behavior, so that I can improve instructions safely.
35. As a user, I want publishing a Skill to create an immutable version, so that runs can be reproduced and audited.
36. As a user, I want to roll a Skill back to an earlier published version, so that a bad instruction change can be reversed.
37. As a user, I want Skills available from the selection menu, block menu, slash menu, and AI chat where their configured input scope is valid, so that repeatable workflows are easy to invoke.
38. As a user, I want Skills hidden from editor menus when menu visibility is disabled, so that frequently used actions stay concise.
39. As a user, I want a Skill run to show which published version was used, so that I can diagnose changed behavior.
40. As a user, I want invalid Skill drafts to fail publication with actionable validation messages, so that runtime errors are found before use.
41. As a user, I want one active personal Instructions Page, so that my preferred tone, language, and response rules apply consistently to ordinary AI actions.
42. As a user, I want to switch my active Instructions Page, so that I can change my default AI mode without deleting alternatives.
43. As a user, I want personal Instructions to remain separate from custom Agent instructions, so that activating a personal preference does not silently change an Agent.
44. As a user, I want to create a custom Agent with its own Instructions Page, Skills, Tools, model policy, and maximum steps, so that multi-step behavior is explicit and bounded.
45. As a user, I want an Agent to read the current Page and relevant learning memory, so that it can coach using the context that matters.
46. As a user, I want an Agent to create a DocumentProposal rather than directly editing a Page, so that I remain in control of document changes.
47. As a user, I want an Agent's direct LearningItem creation to require approval, so that it cannot silently add unverified lessons.
48. As a user, I want an Agent to stop at its maximum step count, so that loops cannot consume unlimited time or model quota.
49. As a user, I want every Agent Tool call to record its validated input, result, risk, approval state, timing, and failure code with secrets redacted, so that runs are inspectable.
50. As a user, I want to cancel a running Agent, so that I can stop work that is no longer useful.
51. As a user, I want retrying an Agent run to be idempotent where applicable, so that transient failures do not duplicate proposals or LearningItems.
52. As a user, I want a scheduled Agent to place Page changes in a proposal inbox, so that background execution cannot silently rewrite documents.
53. As a user, I want scheduled Agent failures to be visible with a safe retry path, so that background work does not disappear silently.
54. As a user, I want an Agent run to show model and Skill version snapshots, so that results can be traced to the configuration that produced them.
55. As a maintainer, I want business modules not to import Tiptap or ProseMirror, so that document-engine knowledge remains localized.
56. As a maintainer, I want editor tests to exercise the document-editor public interface using the real in-memory schema, so that tests verify observable behavior without mocking internal commands.
57. As a maintainer, I want server and client operation application to share the same schema and transaction builders, so that canonical commits and previews cannot drift.
58. As a maintainer, I want Page routes to delegate to application module interfaces, so that authorization, validation, and domain behavior are not duplicated in transport handlers.
59. As a maintainer, I want AI provider behavior to stay behind one Gemini interface, so that Actions, Skills, and Agents reuse key pooling, retries, timeouts, redaction, and error mapping.
60. As a maintainer, I want document migrations backed by real fixtures, so that adding or removing an extension cannot strand stored Pages.
61. As a maintainer, I want every new custom node to declare serialization, migration, copy/paste, readonly rendering, undo/redo, and performance behavior, so that schema evolution remains controlled.
62. As a maintainer, I want generated build artifacts excluded from lint, so that lint reports actionable source problems.
63. As a maintainer, I want typecheck, unit tests, lint, package-boundary checks, end-to-end tests, and production build to pass at every migration phase, so that the redesign remains releasable.
64. As a maintainer, I want old AI mutation routes removed after all callers move to proposals, so that the application does not permanently support two competing protocols.
65. As a product owner, I want the architecture delivered in vertical phases that preserve working behavior, so that Skills and Agents do not block correctness improvements to the current editor.

## Implementation Decisions

- The repository remains a single domain context. A domain glossary will define Page, StoredDocument, Review, Finding, DocumentProposal, LearningItem, Skill, Instructions, Agent, AgentRun, and ToolCall. The ambiguous term Correction will not be introduced as a second name for Finding or Proposal.
- Capability-oriented deep modules will be used instead of generic domain/application/infrastructure layers. The principal modules are documents, document-editor, AI coaching, learning, Skills, and Agents.
- Each deep module will expose a small root interface. Callers and tests will use only these entrypoints; implementation subfolders remain private and package-boundary checks enforce the rule.
- Tiptap and ProseMirror belong to the document-editor module. Other modules exchange document contracts and never receive a Tiptap Editor instance.
- No hypothetical multi-adapter EditorOperations port will be created. The document-editor module will expose concrete operations through an opaque editor session on the client and headless document application on the server. A provider-neutral port may be introduced later only if a second document engine or test adapter becomes real.
- The primary test seam is the highest complete workflow: create an AI Action, Review, Skill, or Agent result; persist a DocumentProposal; preview it; accept or reject it; and observe the canonical Page, proposal status, Findings, and LearningItems. Module-level tests will use the public documents and document-editor interfaces beneath this workflow.
- Stored Page content will use an explicit schema version and a monotonically increasing content revision. Page title, parent, position, and similar metadata will use a separate metadata revision.
- Existing Page JSON will be backfilled to the first stored schema version. Existing stable block IDs must be preserved; missing IDs may be generated during migration.
- A migration dispatcher will apply ordered, idempotent migrations until a document reaches the latest schema version. Every schema-changing extension update must provide migration fixtures before release.
- The server will validate stored documents against the complete current document schema. Arbitrary records are not sufficient validation.
- Plain text is a server-derived projection of canonical document JSON. Clients will not be trusted to submit the canonical plain-text value.
- Stable IDs will be attached to editable semantic blocks, including paragraphs, headings, list items, task items, blockquotes, and code blocks. List containers will not be treated as editable AI targets when the item is the actual unit of text.
- ProseMirror positions are session-local implementation details. Persisted or networked mutation targets will use block ID, block-relative offsets, expected text, and base content revision.
- The initial operation language includes replace text, insert validated blocks after a block, set a whitelist of block attributes, and delete validated blocks. Every operation has enough expected state to reject a stale or mis-targeted mutation.
- A batch of document operations is atomic and maps to one ProseMirror transaction and one undo step.
- Portable AI context is a derived excerpt rather than the canonical document format. It retains block ID, supported block type, text, relevant attributes, and nesting path. Nested structures must not be flattened in a way that makes a later operation ambiguous.
- The document-editor schema definition will be separated from React NodeViews so the same schema can be instantiated headlessly on the server.
- Paragraphs, headings, lists, and other ordinary text nodes will use normal DOM rendering. React NodeViews remain reserved for blocks that need embedded interactive controls, such as the code block.
- The live editor will be isolated from unrelated sidebar, practice, live-coach, and application state. React editor state subscriptions will select only values needed by a specific editor UI element.
- Autosave will write Page content through a content-specific mutation interface using the expected content revision. Metadata writes use a separate mutation interface and do not invalidate document proposals.
- Switching Pages and starting AI work will flush pending content saves. Autosave requests are serialized per Page and conflicts are surfaced rather than overwritten.
- AI Actions, Reviews, Skills, and Agents all create generic AI run records. A run records source kind, model, configuration snapshots, status, timing, safe error information, and links to outputs.
- A Review remains the pedagogical analysis of a Page snapshot. A Finding remains one pedagogical observation. Document mutation approval is represented separately by a DocumentProposal.
- A DocumentProposal records its Page, base content revision, validated operation batch, source run, summary, status, creator, and audit timestamps.
- Proposal status is pending, accepted, rejected, or stale. Acceptance and rejection endpoints are idempotent.
- Proposal preview is represented with ephemeral ProseMirror decorations. Persisted proposal data remains outside the document schema.
- Proposal acceptance is server-canonical. The server locks the Page and proposal, validates ownership and status, migrates the document if needed, validates expected targets, applies operations headlessly, derives plain text, increments the content revision, marks the proposal accepted, updates linked Findings, and creates eligible LearningItems in one database transaction.
- After acceptance, the server returns the canonical document and new content revision. The client synchronizes the committed operations into the live editor using a transaction origin that does not trigger a duplicate autosave but remains undoable.
- The editor will temporarily prevent local mutations while proposal acceptance is in flight. If local reconciliation fails, it will load the canonical server document and present a recovery message rather than pretending the change is unsaved.
- Rejecting a proposal changes proposal and linked Finding decisions without modifying Page content.
- Editing a proposal target or changing its base content revision makes the proposal stale. Stale proposals cannot be accepted; the user can regenerate them.
- Explanation and phrase-learning actions return read-only output and do not create document proposals.
- Accepting or saving a pedagogical Finding creates a LearningItem. Generic rewrite, shorten, expand, reformat, and tone changes do not automatically create LearningItems.
- A failed or rolled-back proposal transaction cannot create a LearningItem. Existing LearningItems, practice sessions, attempts, and learning schedules are migrated unchanged.
- Any existing Page can be marked as a Skill. Marking adds Skill metadata and does not move, copy, or replace the Page.
- A Skill Page's document is the editable draft instructions. Runtime policy fields such as input scope, output mode, allowed Tools, approval policy, status, and editor-menu visibility are structured metadata and are never inferred from headings or formatting.
- Publishing a Skill compiles the draft into an immutable Skill version containing the instruction snapshot, normalized configuration, compiler version, and publication metadata. Runtime execution uses a published version, never the mutable draft.
- Skill compilation accepts normal Page formatting but extracts only supported text structure. Missing instructions, unsupported policy combinations, oversized content, missing required references, or inaccessible Tools block publication with actionable validation feedback.
- Skill scope initially supports selection, block, and Page. Workspace scope remains disabled until retrieval and explicit context-budget behavior exist.
- Skills may be exposed in the selection menu, block menu, slash menu, and Agent invocation. Menu visibility is explicit metadata.
- A user may have multiple Instructions Pages but only one active personal Instructions Page. Its snapshot and revision are recorded on every applicable AI run.
- Personal Instructions apply to ordinary AI Actions and personal Agent chat. Custom Agents use their own linked Instructions Page and do not inherit personal Instructions implicitly.
- The existing `@google/genai` SDK remains the only AI SDK. The provider module will be extended for function calling and agent interactions while preserving existing key pooling, retries, cooldowns, timeout behavior, abort signals, secret redaction, and user-safe error mapping.
- A Tool definition includes name, description, Zod input and output schemas, ownership/permission requirement, risk classification, approval requirement, and executor.
- The initial Agent Tool set is read current Page, search learning memory, create DocumentProposal, and create LearningItems.
- Tool calls are always validated after model generation and before execution. The model never executes application code or receives direct database/editor access.
- The initial Agent runtime activates four Tools and allows at most six steps per run. It supports cancellation, safe retries, and a terminal status for success, failure, cancellation, or step-limit exhaustion.
- Every Tool call records validated input, output or failure, risk, approval state, timing, and idempotency information with secrets and sensitive provider data redacted.
- Every document write from an AI Action, Skill, or Agent requires a DocumentProposal. No trusted Agent flag may bypass document approval.
- Direct Agent creation of LearningItems requires approval. LearningItems derived during acceptance of an eligible pedagogical Finding are created automatically within the acceptance transaction.
- The first Agent release is manually triggered. Scheduled custom Agents are enabled only after cancellation, retry, idempotency, audit, cost/token metrics, and proposal recovery are operational.
- Scheduled Agents place document changes into a proposal inbox and never auto-accept them. Manual and scheduled are the only initial trigger types.
- Route handlers remain the transport for client mutations and streamed/long-running AI work. They delegate to module interfaces and contain no duplicated domain workflow. Server Actions are not required merely for architectural symmetry.
- Existing transform and Finding mutation routes will be removed once all current callers use the unified proposal workflow. Long-term dual protocols are not supported.
- The migration will be delivered in vertical phases: quality and domain baseline; document/editor kernel; unified AI proposals; Skills and Instructions; controlled manual Agents; and scheduled custom Agents.
- The quality baseline includes excluding generated `.next-test` artifacts from lint and resolving current source lint failures before larger extraction work begins.

## Testing Decisions

- Tests assert observable behavior through deep-module public interfaces. They must not import private implementation helpers, inspect private plugin state, or require knowledge of internal folder layout.
- The highest-value integration seam covers the entire proposal lifecycle from AI request input through persisted proposal, canonical server acceptance, client reconciliation, and resulting LearningItems. This seam is preferred over separate tests for every route helper.
- The documents module will be tested for stored-schema validation, ordered migration, idempotent migration, preservation of existing IDs, rejection of unsupported content, and deterministic plain-text projection.
- The document-editor module will be tested using the real in-memory Tiptap/ProseMirror schema. Client and headless application must produce the same document for every operation fixture.
- Operation tests cover replacement, insertion, attribute changes, deletion, nested lists, task items, headings, marks, code blocks, duplicated text, missing blocks, expected-text mismatch, content-revision mismatch, atomic batches, and one-step undo.
- Persistence tests cover independent metadata and content revisions, serialized autosave, stale writes, Page switching with pending saves, server-derived plain text, and schema migration during reads and writes.
- Proposal tests cover pending, accepted, rejected, and stale behavior; acceptance and rejection idempotency; concurrent acceptance; database rollback; canonical document update; client synchronization; and recovery after reconciliation failure.
- Learning tests cover automatic creation only for eligible pedagogical Findings, explicit Save without Apply, no creation for rejected or failed proposals, uniqueness, and preservation of existing practice scheduling behavior.
- Review tests cover exact Finding targets, repeated source text, multiple Findings sharing a proposal, stale Review snapshots, and explanation-only output.
- Skill tests cover marking and unmarking Pages, draft and published isolation, immutable versions, rollback, compiler validation, menu visibility, supported input scopes, inaccessible Tools, and run audit snapshots.
- Instructions tests cover a single active personal Instructions Page, switching profiles, run snapshots, and isolation from custom Agent instructions.
- Tool registry tests cover schema validation, authorization, risk classification, approval enforcement, executor failures, result validation, idempotency, and audit redaction.
- Agent runtime tests cover valid sequential Tool calls, independent parallel calls where explicitly supported, invalid arguments, unauthorized ownership, maximum steps, cancellation, transient retry, duplicate execution, proposal creation, direct LearningItem approval, and terminal run states.
- Scheduled Agent tests cover schedule idempotency, missed/duplicate trigger handling, proposal inbox delivery, cancellation, retries, and the invariant that document proposals remain pending.
- End-to-end tests extend the existing desktop and mobile Playwright editor coverage. Required scenarios include selection to proposal to preview to accept to undo to reload; edit-while-AI-runs causing stale state; duplicated Finding text; Skill invocation from selection, block, and slash menus; Skill publish/version behavior; manual Agent proposal creation; and scheduled Agent proposal inbox behavior.
- Existing Vitest patterns for block identity, block transactions, AI stale detection, selection segmentation, inline diff, Gemini schema validation, learning state, and API key pooling are prior art and should be retained at the appropriate public seam.
- Every delivery phase must pass TypeScript checking, unit and integration tests, lint, package-boundary checks, desktop/mobile end-to-end tests, and production build.
- Performance acceptance includes confirming that unrelated application state changes do not rerender the editor, normal typing does not rerender the whole workspace, and large documents do not mount React NodeViews for ordinary blocks.
- Migration acceptance uses representative persisted fixtures from every stored schema version and verifies that no existing Page, block ID, Finding, LearningItem, practice session, or practice attempt is lost.

## Out of Scope

- Realtime multi-user collaboration, Y.js persistence, conflict-free merge, and offline synchronization.
- Per-paragraph or per-block database rows as the primary document representation.
- Replacing Tiptap with another editor engine. The architecture localizes Tiptap knowledge but does not promise a three-file editor swap.
- Allowing a trusted Agent, Skill, schedule, or approval policy to modify Page content without a DocumentProposal.
- Workspace-wide Skill execution until explicit retrieval, ranking, and context-budget behavior exists.
- External event triggers, webhooks, third-party connectors, email/calendar actions, or a general integration marketplace.
- A large initial Tool catalog; the first Agent runtime is intentionally limited to four Tools.
- Automatic rebasing of stale proposals. Initial behavior is stale detection followed by regeneration.
- Tracked changes stored as document marks or nodes. Proposal state remains outside the document.
- Persisting transient AI loading, streaming, error, or preview state in the Page document.
- Introducing Vercel AI SDK, LangChain, or another agent framework while `@google/genai` satisfies the required structured-output and function-calling capabilities.
- Native mobile applications or changes to the existing web authentication model.
- Multi-workspace membership and collaborative permission roles beyond current ownership checks.

## Further Notes

- The current baseline has passing TypeScript checking, 45 unit tests, and package-boundary validation. Lint currently fails because generated `.next-test` output is not ignored and because of two source-level lint violations; this is Phase 0 work rather than evidence that the target architecture is invalid.
- Tiptap's UniqueID extension supports configured node IDs across split, merge, undo/redo, and paste operations: https://tiptap.dev/docs/editor/extensions/functionality/uniqueid
- Tiptap recommends isolating the editor from unrelated React state and using selective editor-state subscriptions: https://tiptap.dev/docs/guides/performance
- Gemini structured output and function calling are available through the current Google Gen AI SDK, and the application remains responsible for Tool execution and validation: https://ai.google.dev/gemini-api/docs/structured-output and https://ai.google.dev/gemini-api/docs/function-calling
- The Skill user experience follows Notion's model of marking a normal Page as a Skill and invoking it from editor surfaces, while adding immutable publication versions for NativeNote auditability: https://www.notion.com/help/skills-for-notion-agent
- Personal Instructions follow the one-active-Page model, while custom Agents keep independent instructions: https://www.notion.com/help/instructions-for-notion-agent
- The locked product assumptions are single-user JSON snapshot persistence for the next 6–12 months, redesign permission for routes and data models with full migration of existing data, mandatory proposals for document writes, LearningItems only from pedagogical Findings, and continued use of `@google/genai`.
