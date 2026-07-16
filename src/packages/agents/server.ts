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
  READ_ONLY_AGENT_TOOLS,
  createInitialToolRegistry,
  runReadOnlyAgent,
  type AgentHistoryItem,
  type AgentModel,
  type ToolRegistry,
} from "./index";

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
      (tool) => !(READ_ONLY_AGENT_TOOLS as readonly string[]).includes(tool)
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
    "You are a bounded, read-only NativeNote Agent. Use only the supplied Tools. Never claim to edit a Page, create a DocumentProposal or LearningItem, or perform an action outside those Tools. Return a concise final response when the task is complete.",
  ]
    .filter(Boolean)
    .join("\n\n");
  const declarations: FunctionDeclaration[] = toolSnapshots.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parametersJsonSchema: tool.inputSchema,
    responseJsonSchema: tool.outputSchema,
  }));
  return generateAgentStep(
    historyContents(history),
    systemInstruction,
    declarations,
    { model: agentSnapshot.modelPolicy.model }
  );
};

export async function runAgentDefinition({
  userId,
  agentId,
  pageId,
  prompt,
  model = geminiAgentModel,
  registry = createInitialToolRegistry(),
}: {
  userId: string;
  agentId: string;
  pageId: string;
  prompt: string;
  model?: AgentModel;
  registry?: ToolRegistry;
}) {
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
  const [sourceRun] = await db
    .insert(aiRuns)
    .values({
      pageId,
      creatorId: userId,
      sourceKind: "agent",
      action: "manual_agent",
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
  if (!sourceRun) throw new Error("AI run was not created.");
  const [run] = await db
    .insert(agentRuns)
    .values({
      sourceRunId: sourceRun.id,
      agentId,
      pageId,
      creatorId: userId,
      promptSnapshot: prompt,
      agentSnapshot: definition,
      toolSnapshots,
      status: "running",
    })
    .returning();
  if (!run) throw new Error("AgentRun was not created.");

  async function finishRuns({
    status,
    output,
    stepCount,
    errorCode,
  }: {
    status: "completed" | "failed" | "step_limit";
    output: string | null;
    stepCount: number;
    errorCode: string | null;
  }) {
    return db.transaction(async (tx) => {
      const completedAt = new Date();
      await tx
        .update(aiRuns)
        .set({
          status,
          outputSnapshot: { output, stepCount, errorCode },
          completedAt,
        })
        .where(eq(aiRuns.id, sourceRun.id));
      const [completed] = await tx
        .update(agentRuns)
        .set({ status, output, stepCount, errorCode, completedAt })
        .where(eq(agentRuns.id, run.id))
        .returning();
      return completed;
    });
  }

  let result;
  try {
    result = await runReadOnlyAgent({
      definition,
      prompt,
      context: { userId, currentPageId: pageId },
      tools: registry,
      model,
      audit: async (audit) => {
        await db.insert(toolCalls).values({
          agentRunId: run.id,
          providerCallId: audit.toolCallId,
          name: audit.name,
          input: audit.input,
          output: audit.output,
          risk: audit.risk,
          approvalState: audit.approvalState,
          failureCode: audit.failureCode,
          startedAt: audit.startedAt,
          completedAt: audit.completedAt,
          durationMs: audit.durationMs,
        });
      },
    });
  } catch (error) {
    await finishRuns({
      status: "failed",
      output: null,
      stepCount: 0,
      errorCode: "AGENT_RUNTIME_FAILED",
    });
    throw error;
  }
  return finishRuns({
    status: result.status,
    output: result.output,
    stepCount: result.steps,
    errorCode: result.errorCode,
  });
}

export async function loadAgentRuns(userId: string, agentId: string) {
  return db
    .select()
    .from(agentRuns)
    .innerJoin(agents, eq(agentRuns.agentId, agents.id))
    .where(and(eq(agentRuns.agentId, agentId), eq(agents.creatorId, userId)))
    .orderBy(desc(agentRuns.createdAt));
}
