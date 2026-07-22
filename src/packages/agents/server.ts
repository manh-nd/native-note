import type { Content, FunctionDeclaration, Part } from "@google/genai";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  aiRuns,
  agentRuns,
  agents,
  pages,
  skills,
  skillVersions,
  toolCalls,
  workspaces,
} from "@/db/schema";
import { ApiError } from "@/lib/api";
import { generateAgentStep } from "@/lib/ai/gemini";
import {
  AGENT_MAX_STEPS,
  AgentModelError,
  AGENT_TOOLS,
  createInitialToolRegistry,
  runAgent,
  type AgentHistoryItem,
  type AgentModel,
  type AgentRunResult,
  type ToolRegistry,
} from "./index";
import {
  createDatabaseToolCallStore,
  createDurableToolCallExecutor,
  type DurableToolCallStore,
} from "./tool-execution";
import { linkAgentLearningItemRecommendationToolCall } from "./learning-items";

const activeAgentRuns = new Map<string, AbortController>();

async function persistedCancellationRequested(runId: string) {
  const [run] = await db
    .select({
      status: agentRuns.status,
      cancellationRequestedAt: agentRuns.cancellationRequestedAt,
    })
    .from(agentRuns)
    .where(eq(agentRuns.id, runId))
    .limit(1);
  return run?.status === "cancelled" || run?.cancellationRequestedAt != null;
}

export type CreateAgentDefinitionInput = {
  userId: string;
  name: string;
  instructionsPageId: string;
  skillVersionIds: string[];
  allowedTools: string[];
  modelPolicy: { model: string };
  maxSteps: number;
};

async function assertOwnedInstructionsPage(userId: string, pageId: string) {
  const [owned] = await db
    .select({ id: pages.id })
    .from(pages)
    .innerJoin(workspaces, eq(pages.workspaceId, workspaces.id))
    .where(
      and(
        eq(pages.id, pageId),
        eq(workspaces.userId, userId),
        isNull(pages.deletedAt)
      )
    )
    .limit(1);
  if (!owned)
    throw new ApiError(
      404,
      "Không tìm thấy Page Instructions của Agent.",
      "AGENT_INSTRUCTIONS_INACCESSIBLE"
    );
}

async function assertOwnedPublishedSkillVersions(
  userId: string,
  versionIds: string[]
) {
  if (versionIds.length === 0) return;
  const owned = await db
    .select({ id: skillVersions.id })
    .from(skillVersions)
    .innerJoin(skills, eq(skillVersions.skillId, skills.id))
    .innerJoin(pages, eq(skills.pageId, pages.id))
    .innerJoin(workspaces, eq(pages.workspaceId, workspaces.id))
    .where(
      and(
        inArray(skillVersions.id, versionIds),
        eq(workspaces.userId, userId),
        isNull(pages.deletedAt)
      )
    );
  if (new Set(owned.map(({ id }) => id)).size !== versionIds.length)
    throw new ApiError(
      422,
      "Một hoặc nhiều phiên bản Skill không thể truy cập.",
      "AGENT_SKILL_INACCESSIBLE"
    );
}

export async function createAgentDefinition(input: CreateAgentDefinitionInput) {
  const skillVersionIds = [...new Set(input.skillVersionIds)];
  const allowedTools = [...new Set(input.allowedTools)];
  if (
    allowedTools.some(
      (tool) => !(AGENT_TOOLS as readonly string[]).includes(tool)
    )
  )
    throw new ApiError(
      422,
      "Agent yêu cầu Tool không thể truy cập.",
      "AGENT_TOOL_INACCESSIBLE"
    );
  if (input.maxSteps < 1 || input.maxSteps > AGENT_MAX_STEPS)
    throw new ApiError(
      422,
      `Agent phải có từ 1 đến ${AGENT_MAX_STEPS} bước.`,
      "AGENT_MAX_STEPS_INVALID"
    );
  await assertOwnedInstructionsPage(input.userId, input.instructionsPageId);
  await assertOwnedPublishedSkillVersions(input.userId, skillVersionIds);
  const [created] = await db
    .insert(agents)
    .values({
      creatorId: input.userId,
      name: input.name.trim(),
      instructionsPageId: input.instructionsPageId,
      skillVersionIds,
      allowedTools,
      modelPolicy: input.modelPolicy,
      maxSteps: input.maxSteps,
    })
    .returning();
  return created;
}

export async function listAgentDefinitions(userId: string) {
  return db
    .select()
    .from(agents)
    .where(eq(agents.creatorId, userId))
    .orderBy(desc(agents.createdAt));
}

function historyContents(history: AgentHistoryItem[]): Content[] {
  const contents = history.map((item) => {
    if (item.role === "user")
      return { role: "user", parts: [{ text: item.text }] };
    if (item.role === "agent") {
      const parts: Part[] = [];
      if (item.text) parts.push({ text: item.text });
      parts.push(
        ...item.calls.map((call) => ({
          functionCall: {
            id: call.id,
            name: call.name,
            args:
              typeof call.input === "object" && call.input !== null
                ? (call.input as Record<string, unknown>)
                : {},
          },
        }))
      );
      return { role: "model", parts };
    }
    return {
      role: "user",
      parts: [
        {
          functionResponse: {
            id: item.toolCallId,
            name: item.name,
            response: item.error
              ? { error: item.error }
              : { output: item.output },
          },
        },
      ],
    };
  });
  return contents.reduce<Content[]>((merged, content) => {
    const previous = merged.at(-1);
    if (previous?.role === content.role) {
      previous.parts = [...(previous.parts ?? []), ...(content.parts ?? [])];
    } else {
      merged.push(content);
    }
    return merged;
  }, []);
}

const geminiAgentModel: AgentModel = async ({
  agentSnapshot,
  toolSnapshots,
  history,
  signal,
}) => {
  const skills = agentSnapshot.skillVersions
    .map(
      (version) =>
        `Published Skill v${version.version} (${version.id}):\n${version.instructionSnapshot}`
    )
    .join("\n\n");
  const systemInstruction = [
    agentSnapshot.instructions.snapshot,
    skills,
    "You are a bounded NativeNote Agent. Use only the supplied Tools. Page changes can only be submitted through the create_document_proposal Tool and always require the user to accept the pending DocumentProposal. You may recommend a pedagogical LearningItem only through create_learning_item_recommendation; it remains pending until the user approves it, so never claim it is active. Never create an active LearningItem directly or perform an action outside the supplied Tools. Return a concise final response when the task is complete.",
  ]
    .filter(Boolean)
    .join("\n\n");
  const declarations: FunctionDeclaration[] = toolSnapshots.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parametersJsonSchema: tool.inputSchema,
    responseJsonSchema: tool.outputSchema,
  }));
  try {
    return await generateAgentStep(
      historyContents(history),
      systemInstruction,
      declarations,
      { model: agentSnapshot.modelPolicy.model, maxAttempts: 1, signal }
    );
  } catch (error) {
    if (signal?.aborted) throw error;
    const code = error instanceof ApiError ? error.code : "AI_PROVIDER_ERROR";
    throw new AgentModelError(code, {
      retryable: [
        "AI_RATE_LIMITED",
        "AI_TIMEOUT",
        "AI_PROVIDER_ERROR",
      ].includes(code),
    });
  }
};

export async function runAgentDefinition({
  userId,
  agentId,
  pageId,
  prompt,
  model = geminiAgentModel,
  registry = createInitialToolRegistry(),
  retryOfRunId,
  retryRootRunId,
  trigger = "manual",
  scheduleDeliveryId,
  toolCallStore,
  isCancellationRequested = persistedCancellationRequested,
}: {
  userId: string;
  agentId: string;
  pageId: string;
  prompt: string;
  model?: AgentModel;
  registry?: ToolRegistry;
  retryOfRunId?: string;
  retryRootRunId?: string;
  trigger?: "manual" | "scheduled";
  scheduleDeliveryId?: string;
  toolCallStore?: DurableToolCallStore;
  isCancellationRequested?: (runId: string) => Promise<boolean>;
}) {
  if (scheduleDeliveryId) {
    const [existing] = await db
      .select()
      .from(agentRuns)
      .where(
        and(
          eq(agentRuns.scheduleDeliveryId, scheduleDeliveryId),
          eq(agentRuns.creatorId, userId)
        )
      )
      .limit(1);
    if (existing) return existing;
  }
  const [owned] = await db
    .select({
      agent: agents,
      instructionsPageId: pages.id,
      instructionsContentRevision: pages.contentRevision,
      instructionsSnapshot: pages.plainText,
    })
    .from(agents)
    .innerJoin(pages, eq(agents.instructionsPageId, pages.id))
    .innerJoin(workspaces, eq(pages.workspaceId, workspaces.id))
    .where(
      and(
        eq(agents.id, agentId),
        eq(agents.creatorId, userId),
        eq(workspaces.userId, userId),
        isNull(pages.deletedAt)
      )
    )
    .limit(1);
  if (!owned)
    throw new ApiError(404, "Không tìm thấy Agent.", "AGENT_NOT_FOUND");

  const [currentPage] = await db
    .select({ id: pages.id, contentRevision: pages.contentRevision })
    .from(pages)
    .innerJoin(workspaces, eq(pages.workspaceId, workspaces.id))
    .where(
      and(
        eq(pages.id, pageId),
        eq(workspaces.userId, userId),
        isNull(pages.deletedAt)
      )
    )
    .limit(1);
  if (!currentPage)
    throw new ApiError(404, "Không tìm thấy Page.", "NOT_FOUND");

  const versions = owned.agent.skillVersionIds.length
    ? await db
        .select({
          id: skillVersions.id,
          version: skillVersions.version,
          instructionSnapshot: skillVersions.instructionSnapshot,
        })
        .from(skillVersions)
        .innerJoin(skills, eq(skillVersions.skillId, skills.id))
        .where(
          and(
            inArray(skillVersions.id, owned.agent.skillVersionIds),
            eq(skills.creatorId, userId)
          )
        )
    : [];
  if (versions.length !== owned.agent.skillVersionIds.length)
    throw new ApiError(
      409,
      "Cấu hình Skill của Agent không còn truy cập được.",
      "AGENT_SKILL_INACCESSIBLE"
    );

  const definition = {
    id: owned.agent.id,
    name: owned.agent.name,
    instructions: {
      pageId: owned.instructionsPageId,
      contentRevision: owned.instructionsContentRevision,
      snapshot: owned.instructionsSnapshot,
    },
    skillVersions: versions,
    allowedTools: owned.agent.allowedTools,
    modelPolicy: owned.agent.modelPolicy,
    maxSteps: owned.agent.maxSteps,
  };
  const toolSnapshots = registry.snapshots(definition.allowedTools);
  const { sourceRun, run } = await db.transaction(async (tx) => {
    const [createdSourceRun] = await tx
      .insert(aiRuns)
      .values({
        pageId,
        creatorId: userId,
        sourceKind: "agent",
        action: trigger === "scheduled" ? "scheduled_agent" : "manual_agent",
        model: definition.modelPolicy.model,
        status: "running",
        inputSnapshot: prompt,
        outputSnapshot: {},
        contentRevision: currentPage.contentRevision,
        policySnapshot: { agent: definition, tools: toolSnapshots },
        instructionsPageId: definition.instructions.pageId,
        instructionsContentRevision: definition.instructions.contentRevision,
        instructionsSnapshot: definition.instructions.snapshot,
        completedAt: null,
      })
      .returning();
    if (!createdSourceRun) throw new Error("AI run was not created.");
    const [createdRun] = await tx
      .insert(agentRuns)
      .values({
        sourceRunId: createdSourceRun.id,
        agentId,
        pageId,
        creatorId: userId,
        retryOfRunId,
        retryRootRunId,
        trigger,
        scheduleDeliveryId,
        promptSnapshot: prompt,
        agentSnapshot: definition,
        toolSnapshots,
        status: "running",
      })
      .returning();
    if (!createdRun) throw new Error("AgentRun was not created.");
    return { sourceRun: createdSourceRun, run: createdRun };
  });

  async function finishRuns(
    result: Pick<
      AgentRunResult,
      "status" | "output" | "steps" | "modelAttempts" | "errorCode"
    >
  ) {
    return db.transaction(async (tx) => {
      const completedAt = new Date();
      await tx
        .update(aiRuns)
        .set({
          status: result.status,
          outputSnapshot: {
            output: result.output,
            stepCount: result.steps,
            modelAttempts: result.modelAttempts,
            errorCode: result.errorCode,
          },
          completedAt,
        })
        .where(and(eq(aiRuns.id, sourceRun.id), eq(aiRuns.status, "running")));
      const [completed] = await tx
        .update(agentRuns)
        .set({
          status: result.status,
          output: result.output,
          stepCount: result.steps,
          modelAttempts: result.modelAttempts,
          errorCode: result.errorCode,
          completedAt,
        })
        .where(and(eq(agentRuns.id, run.id), eq(agentRuns.status, "running")))
        .returning();
      if (completed) return completed;
      const [terminal] = await tx
        .select()
        .from(agentRuns)
        .where(eq(agentRuns.id, run.id))
        .limit(1);
      return terminal;
    });
  }

  let result;
  const controller = new AbortController();
  activeAgentRuns.set(run.id, controller);
  try {
    const executeToolCall = createDurableToolCallExecutor({
      registry,
      store:
        toolCallStore ??
        createDatabaseToolCallStore({
          linkInvocation: linkAgentLearningItemRecommendationToolCall,
        }),
      context: { userId, currentPageId: pageId },
      allowedTools: definition.allowedTools,
      provenance: {
        sourceRunId: sourceRun.id,
        agentRunId: run.id,
        idempotencyScopeId: retryRootRunId ?? run.id,
      },
    });
    result = await runAgent({
      definition,
      prompt,
      tools: registry,
      model,
      executeToolCall,
      signal: controller.signal,
      isCancellationRequested: () => isCancellationRequested(run.id),
      onProgress: async ({ steps, modelAttempts }) => {
        await db
          .update(agentRuns)
          .set({ stepCount: steps, modelAttempts })
          .where(
            and(eq(agentRuns.id, run.id), eq(agentRuns.status, "running"))
          );
      },
    });
  } catch (error) {
    await finishRuns({
      status: "failed",
      output: null,
      steps: 0,
      modelAttempts: 0,
      errorCode: "AGENT_RUNTIME_FAILED",
    });
    throw error;
  } finally {
    activeAgentRuns.delete(run.id);
  }
  return finishRuns(result);
}

export async function loadAgentRuns(userId: string, agentId: string) {
  const runs = await db
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.agentId, agentId), eq(agentRuns.creatorId, userId)))
    .orderBy(desc(agentRuns.createdAt));
  const calls = runs.length
    ? await db
        .select()
        .from(toolCalls)
        .where(
          inArray(
            toolCalls.agentRunId,
            runs.map((run) => run.id)
          )
        )
        .orderBy(toolCalls.startedAt)
    : [];
  const callsByRun = Map.groupBy(calls, (call) => call.agentRunId);
  return runs.map((run) => ({
    id: run.id,
    status: run.status,
    trigger: run.trigger,
    modelSnapshot: run.agentSnapshot.modelPolicy,
    toolSnapshots: run.toolSnapshots,
    output: run.output,
    steps: run.stepCount,
    modelAttempts: run.modelAttempts,
    errorCode: run.errorCode,
    createdAt: run.createdAt,
    completedAt: run.completedAt,
    durationMs: run.completedAt
      ? run.completedAt.getTime() - run.createdAt.getTime()
      : null,
    toolCalls: callsByRun.get(run.id) ?? [],
  }));
}

export async function cancelAgentRun(
  userId: string,
  agentId: string,
  runId: string
) {
  const [owned] = await db
    .select({
      id: agentRuns.id,
      sourceRunId: agentRuns.sourceRunId,
      stepCount: agentRuns.stepCount,
      modelAttempts: agentRuns.modelAttempts,
    })
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.id, runId),
        eq(agentRuns.agentId, agentId),
        eq(agentRuns.creatorId, userId),
        eq(agentRuns.status, "running")
      )
    )
    .limit(1);
  if (!owned)
    throw new ApiError(
      404,
      "Không tìm thấy AgentRun đang chạy.",
      "AGENT_RUN_NOT_RUNNING"
    );

  const cancellationRequestedAt = new Date();
  const cancelled = await db.transaction(async (tx) => {
    await tx
      .update(aiRuns)
      .set({
        status: "cancelled",
        outputSnapshot: {
          output: null,
          stepCount: owned.stepCount,
          modelAttempts: owned.modelAttempts,
          errorCode: "AGENT_CANCELLED",
        },
        completedAt: cancellationRequestedAt,
      })
      .where(
        and(eq(aiRuns.id, owned.sourceRunId), eq(aiRuns.status, "running"))
      );
    const [updated] = await tx
      .update(agentRuns)
      .set({
        status: "cancelled",
        errorCode: "AGENT_CANCELLED",
        cancellationRequestedAt,
        completedAt: cancellationRequestedAt,
      })
      .where(and(eq(agentRuns.id, owned.id), eq(agentRuns.status, "running")))
      .returning();
    return updated;
  });
  activeAgentRuns.get(runId)?.abort();
  return cancelled;
}

export async function retryAgentRun({
  userId,
  agentId,
  runId,
  model = geminiAgentModel,
  registry = createInitialToolRegistry(),
}: {
  userId: string;
  agentId: string;
  runId: string;
  model?: AgentModel;
  registry?: ToolRegistry;
}) {
  const [existingRetry] = await db
    .select()
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.retryOfRunId, runId),
        eq(agentRuns.agentId, agentId),
        eq(agentRuns.creatorId, userId)
      )
    )
    .limit(1);
  if (existingRetry) return existingRetry;

  const [previous] = await db
    .select({
      id: agentRuns.id,
      pageId: agentRuns.pageId,
      promptSnapshot: agentRuns.promptSnapshot,
      retryRootRunId: agentRuns.retryRootRunId,
      trigger: agentRuns.trigger,
      status: agentRuns.status,
    })
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.id, runId),
        eq(agentRuns.agentId, agentId),
        eq(agentRuns.creatorId, userId)
      )
    )
    .limit(1);
  if (!previous)
    throw new ApiError(404, "Không tìm thấy AgentRun.", "AGENT_RUN_NOT_FOUND");
  if (previous.status === "running" || previous.status === "completed")
    throw new ApiError(
      409,
      "Chỉ có thể thử lại AgentRun chưa hoàn thành.",
      "AGENT_RUN_NOT_RETRYABLE"
    );

  const retryRootRunId = previous.retryRootRunId ?? previous.id;
  try {
    return await runAgentDefinition({
      userId,
      agentId,
      pageId: previous.pageId,
      prompt: previous.promptSnapshot,
      model,
      registry,
      retryOfRunId: previous.id,
      retryRootRunId,
      trigger: previous.trigger,
    });
  } catch (error) {
    if (
      typeof error !== "object" ||
      error === null ||
      (error as { code?: unknown }).code !== "23505"
    )
      throw error;
    const [winner] = await db
      .select()
      .from(agentRuns)
      .where(
        and(
          eq(agentRuns.retryOfRunId, previous.id),
          eq(agentRuns.creatorId, userId)
        )
      )
      .limit(1);
    if (!winner) throw error;
    return winner;
  }
}
