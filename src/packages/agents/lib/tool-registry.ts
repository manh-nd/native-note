import { z } from "zod";
import type { db } from "@/db";

export type ToolDatabaseTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

export type ToolOwnership = "current_user";
export type ToolRisk = "low" | "medium" | "high";
export type ToolApproval =
  "not_required" | "required_before_execution" | "required_pending_result";

export type AgentToolCallProvenance = {
  sourceRunId: string;
  agentRunId: string;
  providerToolCallId: string;
  idempotencyKey: string;
  idempotencyScopeId: string;
};

export type ToolContext = {
  userId: string;
  currentPageId: string;
  provenance?: AgentToolCallProvenance;
};

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  outputSchema: z.ZodType;
  ownership: ToolOwnership;
  risk: ToolRisk;
  approval: ToolApproval;
  execution: "read_only" | "database_transaction";
  audit?:
    | { mode: "full" }
    | {
        mode: "redacted";
        input: (input: unknown) => unknown;
        output: (output: unknown) => unknown;
      };
  authorize: (
    context: ToolContext,
    input: unknown,
    transaction?: ToolDatabaseTransaction
  ) => Promise<boolean>;
  execute: (
    context: ToolContext,
    input: unknown,
    transaction?: ToolDatabaseTransaction
  ) => Promise<unknown>;
};

export type ToolSnapshot = Pick<
  ToolDefinition,
  "name" | "description" | "ownership" | "risk" | "execution"
> & {
  approval: "not_required" | "required";
  inputSchema: unknown;
  outputSchema: unknown;
  auditMode: "full" | "redacted";
};

export class ToolExecutionError extends Error {
  constructor(
    public readonly code:
      | "TOOL_NOT_ALLOWED"
      | "TOOL_INPUT_INVALID"
      | "TOOL_OWNERSHIP_DENIED"
      | "TOOL_APPROVAL_REQUIRED"
      | "TOOL_EXECUTION_FAILED"
      | "TOOL_OUTPUT_INVALID"
      | "TOOL_PERSISTENCE_FAILED"
      | "TOOL_IDEMPOTENCY_CONFLICT",
    message: string,
    public readonly auditInput?: unknown
  ) {
    super(message);
    this.name = "ToolExecutionError";
  }
}

const SECRET_FIELD = /(?:api[_-]?key|authorization|password|secret|token)$/i;
const SECRET_TEXT_PATTERNS = [
  /\bBearer\s+[^\s,;]+/gi,
  /\b(?:api[_ -]?key|authorization|password|secret|token)\s*[:=]\s*[^\s,;]+/gi,
  /\bAIza[0-9A-Za-z_-]{20,}\b/g,
  /\bsk-[0-9A-Za-z_-]{16,}\b/g,
  /\beyJ[0-9A-Za-z_-]+\.[0-9A-Za-z_-]+\.[0-9A-Za-z_-]+\b/g,
];

function redactSecretText(value: string) {
  return SECRET_TEXT_PATTERNS.reduce(
    (redacted, pattern) => redacted.replace(pattern, "[REDACTED]"),
    value
  );
}

export function redactToolAuditValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactToolAuditValue);
  if (typeof value === "string") return redactSecretText(value);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      SECRET_FIELD.test(key) ? "[REDACTED]" : redactToolAuditValue(child),
    ])
  );
}

function snapshot(definition: ToolDefinition): ToolSnapshot {
  return {
    name: definition.name,
    description: definition.description,
    ownership: definition.ownership,
    risk: definition.risk,
    execution: definition.execution,
    approval:
      definition.approval === "not_required" ? "not_required" : "required",
    inputSchema: z.toJSONSchema(definition.inputSchema),
    outputSchema: z.toJSONSchema(definition.outputSchema),
    auditMode: definition.audit?.mode ?? "full",
  };
}

function isPersistenceFailure(error: unknown) {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: unknown }).code;
  return (
    typeof code === "string" &&
    (/^[0-9A-Z]{5}$/.test(code) || /^(?:ECONN|ETIMEDOUT)/.test(code))
  );
}

export function createToolRegistry(definitions: ToolDefinition[]) {
  const byName = new Map<string, ToolDefinition>();
  for (const definition of definitions) {
    if (!/^[A-Za-z_][A-Za-z0-9_.:-]{0,127}$/.test(definition.name))
      throw new Error(`Invalid Tool name: ${definition.name}`);
    if (!definition.description.trim())
      throw new Error(`Tool ${definition.name} must have a description.`);
    if (
      !definition.inputSchema ||
      typeof definition.inputSchema.safeParse !== "function" ||
      !definition.outputSchema ||
      typeof definition.outputSchema.safeParse !== "function"
    )
      throw new Error(`Tool ${definition.name} must declare Zod schemas.`);
    if (definition.ownership !== "current_user")
      throw new Error(`Tool ${definition.name} has invalid ownership.`);
    if (!(["low", "medium", "high"] as const).includes(definition.risk))
      throw new Error(`Tool ${definition.name} has invalid risk.`);
    if (
      !(["read_only", "database_transaction"] as const).includes(
        definition.execution
      )
    )
      throw new Error(`Tool ${definition.name} has invalid execution mode.`);
    if (
      !(
        [
          "not_required",
          "required_before_execution",
          "required_pending_result",
        ] as const
      ).includes(definition.approval)
    )
      throw new Error(`Tool ${definition.name} has invalid approval policy.`);
    if (
      typeof definition.authorize !== "function" ||
      typeof definition.execute !== "function"
    )
      throw new Error(`Tool ${definition.name} must declare its executors.`);
    if (
      definition.audit?.mode === "redacted" &&
      (typeof definition.audit.input !== "function" ||
        typeof definition.audit.output !== "function")
    )
      throw new Error(`Tool ${definition.name} has an invalid audit policy.`);
    if (byName.has(definition.name))
      throw new Error(`Duplicate Tool name: ${definition.name}`);
    byName.set(definition.name, definition);
  }

  return {
    snapshots(allowedTools?: string[]) {
      const allowed = allowedTools ? new Set(allowedTools) : null;
      return definitions
        .filter((definition) => !allowed || allowed.has(definition.name))
        .map(snapshot);
    },

    async execute(
      name: string,
      rawInput: unknown,
      context: ToolContext,
      allowedTools: string[],
      { transaction }: { transaction?: ToolDatabaseTransaction } = {}
    ) {
      const definition = byName.get(name);
      if (!definition || !allowedTools.includes(name))
        throw new ToolExecutionError(
          "TOOL_NOT_ALLOWED",
          `Tool ${name} is not allowed for this Agent.`
        );
      const parsedInput = definition.inputSchema.safeParse(rawInput);
      if (!parsedInput.success)
        throw new ToolExecutionError(
          "TOOL_INPUT_INVALID",
          `Tool ${name} received invalid input.`
        );
      if (!(await definition.authorize(context, parsedInput.data, transaction)))
        throw new ToolExecutionError(
          "TOOL_OWNERSHIP_DENIED",
          `Tool ${name} cannot access this resource.`
        );
      if (definition.approval === "required_before_execution")
        throw new ToolExecutionError(
          "TOOL_APPROVAL_REQUIRED",
          `Tool ${name} requires approval.`
        );
      if (definition.execution === "database_transaction" && !transaction)
        throw new ToolExecutionError(
          "TOOL_PERSISTENCE_FAILED",
          `Tool ${name} requires a database transaction.`
        );
      const auditInput = redactToolAuditValue(
        definition.audit?.mode === "redacted"
          ? definition.audit.input(parsedInput.data)
          : parsedInput.data
      );
      let rawOutput: unknown;
      try {
        rawOutput = await definition.execute(
          context,
          parsedInput.data,
          transaction
        );
      } catch (error) {
        throw new ToolExecutionError(
          definition.execution === "database_transaction" &&
            isPersistenceFailure(error)
            ? "TOOL_PERSISTENCE_FAILED"
            : "TOOL_EXECUTION_FAILED",
          `Tool ${name} failed.`,
          auditInput
        );
      }
      const output = definition.outputSchema.safeParse(rawOutput);
      if (!output.success)
        throw new ToolExecutionError(
          "TOOL_OUTPUT_INVALID",
          `Tool ${name} returned invalid output.`,
          auditInput
        );
      const auditOutput =
        definition.audit?.mode === "redacted"
          ? definition.audit.output(output.data)
          : output.data;
      return {
        output: output.data,
        auditInput,
        auditOutput: redactToolAuditValue(auditOutput),
        snapshot: snapshot(definition),
      };
    },
  };
}

export type ToolRegistry = ReturnType<typeof createToolRegistry>;
