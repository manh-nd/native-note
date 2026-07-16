import { createHash } from "node:crypto";
import {
  ToolExecutionError,
  type ToolContext,
  type ToolRegistry,
  type ToolRisk,
  type ToolSnapshot,
} from "./tool-registry";

export const AGENT_MAX_STEPS = 6;
export const AGENT_MODEL_MAX_ATTEMPTS = 3;

export class AgentModelError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, { retryable }: { retryable: boolean }) {
    super(code);
    this.name = "AgentModelError";
    this.code = code;
    this.retryable = retryable;
  }
}

export type AgentDefinitionSnapshot = {
  id: string;
  name: string;
  instructions: {
    pageId: string;
    contentRevision: number;
    snapshot: string;
  };
  skillVersions: Array<{
    id: string;
    version: number;
    instructionSnapshot: string;
  }>;
  allowedTools: string[];
  modelPolicy: { model: string };
  maxSteps: number;
};

export type AgentHistoryItem =
  | { role: "user"; text: string }
  | { role: "agent"; text: string | null; calls: AgentToolRequest[] }
  | {
      role: "tool";
      toolCallId: string;
      name: string;
      output?: unknown;
      error?: { code: string };
    };

export type AgentToolRequest = {
  id: string;
  name: string;
  input: unknown;
};

export type AgentModelRequest = {
  prompt: string;
  agentSnapshot: AgentDefinitionSnapshot;
  toolSnapshots: ToolSnapshot[];
  history: AgentHistoryItem[];
  signal?: AbortSignal;
};

export type AgentModel = (
  request: AgentModelRequest
) => Promise<{ text: string | null; calls: AgentToolRequest[] }>;

export type ToolCallAudit = {
  toolCallId: string;
  idempotencyKey: string;
  name: string;
  input: unknown;
  output: unknown | null;
  risk: ToolRisk;
  approvalState: "not_required" | "pending" | "approved" | "denied";
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
  failureCode: string | null;
  reused: boolean;
};

export type CompletedToolCall = {
  name: string;
  input: unknown;
  output: unknown;
  risk: ToolRisk;
  approvalState: ToolCallAudit["approvalState"];
};

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function toolCallIdempotencyKey(name: string, input: unknown) {
  return createHash("sha256")
    .update(canonicalJson({ name, input }))
    .digest("hex");
}

export type AgentRunResult = {
  status: "completed" | "failed" | "cancelled" | "step_limit";
  output: string | null;
  steps: number;
  modelAttempts: number;
  errorCode: string | null;
  agentSnapshot: AgentDefinitionSnapshot;
  toolSnapshots: ToolSnapshot[];
};

export async function runAgent({
  definition,
  prompt,
  context,
  tools,
  model,
  audit,
  signal,
  findCompletedToolCallByIdempotencyKey,
  isCancellationRequested,
  onProgress,
  provenance,
}: {
  definition: AgentDefinitionSnapshot;
  prompt: string;
  context: ToolContext;
  tools: ToolRegistry;
  model: AgentModel;
  audit: (entry: ToolCallAudit) => Promise<void>;
  signal?: AbortSignal;
  findCompletedToolCallByIdempotencyKey?: (
    idempotencyKey: string
  ) => Promise<CompletedToolCall | undefined>;
  isCancellationRequested?: () => Promise<boolean>;
  onProgress?: (progress: {
    steps: number;
    modelAttempts: number;
  }) => Promise<void>;
  provenance?: Omit<
    NonNullable<ToolContext["provenance"]>,
    "providerToolCallId" | "idempotencyKey"
  >;
}): Promise<AgentRunResult> {
  const maxSteps = Math.min(Math.max(definition.maxSteps, 1), AGENT_MAX_STEPS);
  const agentSnapshot = {
    ...definition,
    allowedTools: [...definition.allowedTools],
    skillVersions: definition.skillVersions.map((version) => ({ ...version })),
    instructions: { ...definition.instructions },
    modelPolicy: { ...definition.modelPolicy },
    maxSteps,
  };
  const toolSnapshots = tools.snapshots(agentSnapshot.allowedTools);
  const history: AgentHistoryItem[] = [{ role: "user", text: prompt }];
  const completedToolCalls = new Map<string, CompletedToolCall>();
  let modelAttempts = 0;

  const terminalResult = (
    status: AgentRunResult["status"],
    steps: number,
    errorCode: string | null,
    output: string | null = null
  ): AgentRunResult => ({
    status,
    output,
    steps,
    modelAttempts,
    errorCode,
    agentSnapshot,
    toolSnapshots,
  });
  const cancelled = (steps: number) =>
    terminalResult("cancelled", steps, "AGENT_CANCELLED");
  const shouldCancel = async () =>
    signal?.aborted || (await isCancellationRequested?.()) === true;

  for (let step = 1; step <= maxSteps; step += 1) {
    if (await shouldCancel()) return cancelled(step - 1);
    let response: Awaited<ReturnType<AgentModel>>;
    for (let attempt = 1; ; attempt += 1) {
      modelAttempts += 1;
      await onProgress?.({ steps: step, modelAttempts });
      try {
        response = await model({
          prompt,
          agentSnapshot,
          toolSnapshots,
          history,
          signal,
        });
        break;
      } catch (error) {
        if (await shouldCancel()) return cancelled(step);
        const modelError =
          error instanceof AgentModelError
            ? error
            : new AgentModelError("MODEL_FAILED", { retryable: false });
        if (!modelError.retryable || attempt >= AGENT_MODEL_MAX_ATTEMPTS) {
          return terminalResult("failed", step, modelError.code);
        }
      }
    }
    if (await shouldCancel()) return cancelled(step);
    history.push({ role: "agent", text: response.text, calls: response.calls });
    if (response.calls.length === 0) {
      if (response.text?.trim())
        return terminalResult("completed", step, null, response.text);
      return terminalResult("failed", step, "EMPTY_MODEL_RESPONSE");
    }

    for (const call of response.calls) {
      if (await shouldCancel()) return cancelled(step);
      const idempotencyKey = toolCallIdempotencyKey(call.name, call.input);
      const locallyCompleted = completedToolCalls.get(idempotencyKey);
      const previous =
        locallyCompleted ??
        (await findCompletedToolCallByIdempotencyKey?.(idempotencyKey));
      if (previous) {
        if (previous.name !== call.name) {
          return terminalResult("failed", step, "TOOL_IDEMPOTENCY_CONFLICT");
        }
        completedToolCalls.set(idempotencyKey, previous);
        const reusedAt = new Date();
        await audit({
          toolCallId: call.id,
          idempotencyKey,
          name: call.name,
          input: previous.input,
          output: previous.output,
          risk: previous.risk,
          approvalState: previous.approvalState,
          startedAt: reusedAt,
          completedAt: reusedAt,
          durationMs: 0,
          failureCode: null,
          reused: true,
        });
        history.push({
          role: "tool",
          toolCallId: call.id,
          name: call.name,
          output: previous.output,
        });
        continue;
      }
      const startedAt = new Date();
      try {
        const result = await tools.execute(
          call.name,
          call.input,
          {
            ...context,
            provenance: provenance
              ? {
                  ...provenance,
                  providerToolCallId: call.id,
                  idempotencyKey,
                }
              : undefined,
          },
          agentSnapshot.allowedTools
        );
        const completedAt = new Date();
        await audit({
          toolCallId: call.id,
          idempotencyKey,
          name: call.name,
          input: result.auditInput,
          output: result.auditOutput,
          risk: result.snapshot.risk,
          approvalState: "not_required",
          startedAt,
          completedAt,
          durationMs: completedAt.getTime() - startedAt.getTime(),
          failureCode: null,
          reused: false,
        });
        completedToolCalls.set(idempotencyKey, {
          name: call.name,
          input: result.auditInput,
          output: result.output,
          risk: result.snapshot.risk,
          approvalState: "not_required",
        });
        history.push({
          role: "tool",
          toolCallId: call.id,
          name: call.name,
          output: result.output,
        });
      } catch (error) {
        const completedAt = new Date();
        const failureCode =
          error instanceof ToolExecutionError
            ? error.code
            : "TOOL_EXECUTION_FAILED";
        const toolSnapshot = toolSnapshots.find(
          (snapshot) => snapshot.name === call.name
        );
        await audit({
          toolCallId: call.id,
          idempotencyKey,
          name: call.name,
          input: "[REDACTED:INVALID_OR_UNAUTHORIZED_TOOL_INPUT]",
          output: null,
          risk: toolSnapshot?.risk ?? "high",
          approvalState:
            toolSnapshot?.approval === "not_required"
              ? "not_required"
              : "pending",
          startedAt,
          completedAt,
          durationMs: completedAt.getTime() - startedAt.getTime(),
          failureCode,
          reused: false,
        });
        return terminalResult("failed", step, failureCode);
      }
    }
  }

  return terminalResult("step_limit", maxSteps, "STEP_LIMIT_REACHED");
}
