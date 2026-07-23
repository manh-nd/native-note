# 0006. Harden Skill Compiler & Sandbox Isolation Layer

- **Status**: Accepted
- **Date**: 2026-07-23
- **Deciders**: Manh Nguyen, AI Agentic Pair

---

## Context and Problem Statement

Skills in `src/packages/skills/` compile AI prompts and policies that allow automated agent operations. Currently, tool permission validation and version snapshots lack explicit whitelist proxying and SHA256 integrity verification, leaving prompt compilation vulnerable to unvalidated tool invocations or inconsistent version snapshots.

---

## Decision Drivers

- **Deep Module Architecture**: Refactor `src/packages/skills/` into 3 deep sub-modules: `SkillCompiler` (validation & policy compilation), `SkillSandboxExecutor` (tool whitelist proxying & execution isolation), and `SkillVersionLifecycleManager` (immutable snapshots & integrity hashing).
- **Whitelist Tool Proxy**: Enforce `allowedTools` checking prior to tool execution; throw `SkillPermissionError` if an unapproved tool is requested.
- **Immutable Version Snapshots**: Compute SHA256 checksums for published skill prompts & policy snapshots.
- **Headless Test Runner**: Provide `InMemorySkillSandboxRunner` for fast unit testing without live LLM API calls.

---

## Decision Outcome

We decided to:

1. Refactor `src/packages/skills/` into modular sub-components: `skill-compiler.ts`, `skill-sandbox-executor.ts`, `skill-version-lifecycle.ts`.
2. Implement strict tool whitelist validation with `SkillPermissionError`.
3. Add SHA256 prompt content hashing for `SkillVersionRow` immutable snapshots.
4. Implement `InMemorySkillSandboxRunner` for headless unit testing.
5. Create Parent Spec Issue #16 and 4 tracer-bullet GitHub Issues (#17, #18, #19, #20).
