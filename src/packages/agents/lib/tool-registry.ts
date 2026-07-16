import { z } from "zod";

export type ToolOwnership = "current_user";
export type ToolRisk = "low" | "medium" | "high";
export type ToolApproval = "not_required" | "required";

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
  audit?:
    | { mode: "full" }
    | {
        mode: "redacted";
        input: (input: unknown) => unknown;
        output: (output: unknown) => unknown;
      };
  authorize: (context: ToolContext, input: unknown) => Promise<boolean>;
  execute: (context: ToolContext, input: unknown) => Promise<unknown>;
};

export type ToolSnapshot = Pick<
  ToolDefinition,
  "name" | "description" | "ownership" | "risk" | "approval"
> & {
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
      | "TOOL_OUTPUT_INVALID",
    message: string
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
    approval: definition.approval,
    inputSchema: z.toJSONSchema(definition.inputSchema),
    outputSchema: z.toJSONSchema(definition.outputSchema),
    auditMode: definition.audit?.mode ?? "full",
  };
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
    if (!(["not_required", "required"] as const).includes(definition.approval))
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
      allowedTools: string[]
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
      if (!(await definition.authorize(context, parsedInput.data)))
        throw new ToolExecutionError(
          "TOOL_OWNERSHIP_DENIED",
          `Tool ${name} cannot access this resource.`
        );
      if (definition.approval === "required")
        throw new ToolExecutionError(
          "TOOL_APPROVAL_REQUIRED",
          `Tool ${name} requires approval.`
        );
      let rawOutput: unknown;
      try {
        rawOutput = await definition.execute(context, parsedInput.data);
      } catch {
        throw new ToolExecutionError(
          "TOOL_EXECUTION_FAILED",
          `Tool ${name} failed.`
        );
      }
      const output = definition.outputSchema.safeParse(rawOutput);
      if (!output.success)
        throw new ToolExecutionError(
          "TOOL_OUTPUT_INVALID",
          `Tool ${name} returned invalid output.`
        );
      const auditInput =
        definition.audit?.mode === "redacted"
          ? definition.audit.input(parsedInput.data)
          : parsedInput.data;
      const auditOutput =
        definition.audit?.mode === "redacted"
          ? definition.audit.output(output.data)
          : output.data;
      return {
        output: output.data,
        auditInput: redactToolAuditValue(auditInput),
        auditOutput: redactToolAuditValue(auditOutput),
        snapshot: snapshot(definition),
      };
    },
  };
}

export type ToolRegistry = ReturnType<typeof createToolRegistry>;
