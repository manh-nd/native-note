import { createHash } from "node:crypto";
import { type ToolRegistry, type ToolSnapshot } from "./tool-registry";

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

export type ToolCallRequest = {
  toolCallId: string;
  idempotencyKey: string;
  name: string;
  input: unknown;
};

export type ToolCallOutcome =
  | { status: "completed" | "reused"; output: unknown }
  | { status: "failed"; failureCode: string };

export type ExecuteToolCall = (
  request: ToolCallRequest
) => Promise<ToolCallOutcome>;

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
  tools,
  model,
  executeToolCall,
  signal,
  isCancellationRequested,
  onProgress,
}: {
  definition: AgentDefinitionSnapshot;
  prompt: string;
  tools: ToolRegistry;
  model: AgentModel;
  executeToolCall: ExecuteToolCall;
  signal?: AbortSignal;
  isCancellationRequested?: () => Promise<boolean>;
  onProgress?: (progress: {
    steps: number;
    modelAttempts: number;
  }) => Promise<void>;
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
      const outcome = await executeToolCall({
        toolCallId: call.id,
        idempotencyKey,
        name: call.name,
        input: call.input,
      });
      if (outcome.status === "failed")
        return terminalResult("failed", step, outcome.failureCode);
      history.push({
        role: "tool",
        toolCallId: call.id,
        name: call.name,
        output: outcome.output,
      });
    }
  }

  return terminalResult("step_limit", maxSteps, "STEP_LIMIT_REACHED");
}
