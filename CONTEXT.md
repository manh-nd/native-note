# NativeNote

NativeNote is a single-user writing and learning workspace. It keeps Pages, AI coaching, reusable Skills, and controlled Agents in one shared language.

## Language

**Page**:
A user-owned workspace item with title, placement, and other metadata. A Page owns one StoredDocument as its editable content.
_Avoid_: Note, document (when the workspace item is meant)

**StoredDocument**:
The versioned canonical JSON snapshot that stores a Page's editable content and stable block identities.
_Avoid_: Page content, editor state

**Review**:
A pedagogical analysis of a specific Page snapshot that groups its Findings.
_Avoid_: Correction pass

**Finding**:
One pedagogical observation about a Page snapshot, typically produced by a Review. A Finding may be saved for learning or linked to a DocumentProposal.
_Avoid_: Correction

**DocumentProposal**:
A persisted, validated batch of requested changes to a Page's StoredDocument at a particular content revision, awaiting a user decision.
_Avoid_: Correction, suggested edit

**LearningItem**:
A persisted learning-memory item derived from an eligible pedagogical Finding or an explicitly approved Agent recommendation.
_Avoid_: Correction

**Skill**:
A reusable AI workflow represented by a marked Page and its explicit runtime metadata; published Skill versions are immutable.
_Avoid_: Prompt template

**Instructions**:
Model-facing guidance stored in a Page and selected either as a user's active personal Instructions or an Agent's own Instructions.
_Avoid_: System prompt

**Agent**:
A configured, bounded AI worker with its own Instructions, allowed Skills and Tools, and execution policy.
_Avoid_: Assistant (when the configured worker is meant)

**AgentRun**:
One auditable execution of an Agent, including its configuration snapshots, status, outputs, and ToolCalls.
_Avoid_: Agent session

**AgentSchedule**:
A user-owned recurring instruction to run one Agent against one target Page with a fixed prompt and local cadence.
_Avoid_: Cron job, scheduled Agent

**ScheduleDelivery**:
One idempotent occurrence of an AgentSchedule, identified by the time it was due and linked to at most one AgentRun.
_Avoid_: Trigger, job

**ToolCall**:
One validated invocation of a registered Tool during an AgentRun, including its input, result or failure, risk, approval state, and timing.
_Avoid_: Function call (when the audited domain record is meant)

**Correction**:
Not a NativeNote domain term. Use Finding for a pedagogical observation and DocumentProposal for a proposed document mutation.
_Avoid_: Synonym for Finding or DocumentProposal
