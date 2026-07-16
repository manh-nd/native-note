import { z } from "zod";

export type ToolOwnership = "current_user";
export type ToolRisk = "low" | "medium" | "high";
export type ToolApproval = "not_required" | "required";

export type ToolContext = {
  userId: string;
  currentPageId: string;
};

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  outputSchema: z.ZodType;
  ownership: ToolOwnership;
  risk: ToolRisk;
  approval: ToolApproval;
  authorize: (context: ToolContext, input: unknown) => Promise<boolean>;
  execute: (context: ToolContext, input: unknown) => Promise<unknown>;
};

export type ToolSnapshot = Pick<
  ToolDefinition,
  "name" | "description" | "ownership" | "risk" | "approval"
> & {
  inputSchema: unknown;
  outputSchema: unknown;
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

export function redactToolAuditValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactToolAuditValue);
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
  };
}

export function createToolRegistry(definitions: ToolDefinition[]) {
  const byName = new Map<string, ToolDefinition>();
  for (const definition of definitions) {
    if (!/^[A-Za-z_][A-Za-z0-9_.:-]{0,127}$/.test(definition.name))
      throw new Error(`Invalid Tool name: ${definition.name}`);
    if (!definition.description.trim())
      throw new Error(`Tool ${definition.name} must have a description.`);
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
      return { output: output.data, snapshot: snapshot(definition) };
    },
  };
}

export type ToolRegistry = ReturnType<typeof createToolRegistry>;
