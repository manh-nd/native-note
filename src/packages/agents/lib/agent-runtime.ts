import {
  ToolExecutionError,
  redactToolAuditValue,
  type ToolContext,
  type ToolRegistry,
  type ToolRisk,
  type ToolSnapshot,
} from "./tool-registry";

export const AGENT_MAX_STEPS = 6;

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
};

export type AgentModel = (
  request: AgentModelRequest
) => Promise<{ text: string | null; calls: AgentToolRequest[] }>;

export type ToolCallAudit = {
  toolCallId: string;
  name: string;
  input: unknown;
  output: unknown | null;
  risk: ToolRisk | null;
  approvalState: "not_required" | "required" | null;
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
  failureCode: string | null;
};

export async function runReadOnlyAgent({
  definition,
  prompt,
  context,
  tools,
  model,
  audit,
}: {
  definition: AgentDefinitionSnapshot;
  prompt: string;
  context: ToolContext;
  tools: ToolRegistry;
  model: AgentModel;
  audit: (entry: ToolCallAudit) => Promise<void>;
}) {
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

  for (let step = 1; step <= maxSteps; step += 1) {
    let response: Awaited<ReturnType<AgentModel>>;
    try {
      response = await model({ prompt, agentSnapshot, toolSnapshots, history });
    } catch {
      return {
        status: "failed" as const,
        output: null,
        steps: step,
        errorCode: "MODEL_FAILED",
        agentSnapshot,
        toolSnapshots,
      };
    }
    history.push({ role: "agent", text: response.text, calls: response.calls });
    if (response.calls.length === 0) {
      if (response.text?.trim())
        return {
          status: "completed" as const,
          output: response.text,
          steps: step,
          errorCode: null,
          agentSnapshot,
          toolSnapshots,
        };
      return {
        status: "failed" as const,
        output: null,
        steps: step,
        errorCode: "EMPTY_MODEL_RESPONSE",
        agentSnapshot,
        toolSnapshots,
      };
    }

    for (const call of response.calls) {
      const startedAt = new Date();
      try {
        const result = await tools.execute(
          call.name,
          call.input,
          context,
          agentSnapshot.allowedTools
        );
        const completedAt = new Date();
        await audit({
          toolCallId: call.id,
          name: call.name,
          input: redactToolAuditValue(call.input),
          output: redactToolAuditValue(result.output),
          risk: result.snapshot.risk,
          approvalState: result.snapshot.approval,
          startedAt,
          completedAt,
          durationMs: completedAt.getTime() - startedAt.getTime(),
          failureCode: null,
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
          name: call.name,
          input: redactToolAuditValue(call.input),
          output: null,
          risk: toolSnapshot?.risk ?? null,
          approvalState: toolSnapshot?.approval ?? null,
          startedAt,
          completedAt,
          durationMs: completedAt.getTime() - startedAt.getTime(),
          failureCode,
        });
        return {
          status: "failed" as const,
          output: null,
          steps: step,
          errorCode: failureCode,
          agentSnapshot,
          toolSnapshots,
        };
      }
    }
  }

  return {
    status: "step_limit" as const,
    output: null,
    steps: maxSteps,
    errorCode: "STEP_LIMIT_REACHED",
    agentSnapshot,
    toolSnapshots,
  };
}
