import { and, desc, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  agentLearningItemRecommendations,
  agentRuns,
  learningItems,
  toolCallExecutions,
  toolCalls,
} from "@/db/schema";
import { ApiError } from "@/lib/api";
import {
  learningItemRecommendationDraftSchema,
  type AgentLearningItemRecommendationDraft,
} from "./learning-item-contract";
import type { DurableToolCallInvocation } from "./tool-execution";

export type CreateAgentLearningItemRecommendationInput =
  AgentLearningItemRecommendationDraft & {
    userId: string;
    pageId: string;
    sourceRunId: string;
    agentRunId: string;
    providerToolCallId: string;
    toolCallIdempotencyKey: string;
    idempotencyScopeId: string;
  };

export async function linkAgentLearningItemRecommendationToolCall(
  transaction: Parameters<Parameters<typeof db.transaction>[0]>[0],
  invocation: DurableToolCallInvocation
) {
  if (
    invocation.reused ||
    invocation.name !== "create_learning_item_recommendation" ||
    invocation.failureCode !== null ||
    typeof invocation.output !== "object" ||
    invocation.output === null ||
    typeof (invocation.output as { recommendationId?: unknown })
      .recommendationId !== "string"
  )
    return;
  const [audited] = await transaction
    .update(agentLearningItemRecommendations)
    .set({ auditedAt: invocation.completedAt })
    .where(
      and(
        eq(
          agentLearningItemRecommendations.id,
          (invocation.output as { recommendationId: string }).recommendationId
        ),
        eq(agentLearningItemRecommendations.agentRunId, invocation.agentRunId),
        eq(
          agentLearningItemRecommendations.providerToolCallId,
          invocation.providerCallId
        ),
        eq(agentLearningItemRecommendations.status, "pending")
      )
    )
    .returning({ id: agentLearningItemRecommendations.id });
  if (!audited)
    throw new Error("LearningItem recommendation audit could not be linked.");
}

export async function createAgentLearningItemRecommendation(
  rawInput: CreateAgentLearningItemRecommendationInput,
  transaction?: Parameters<Parameters<typeof db.transaction>[0]>[0]
): Promise<{ recommendationId: string; status: "pending" }> {
  const input = z
    .object({
      userId: z.string().min(1),
      pageId: z.string().min(1),
      sourceRunId: z.string().min(1),
      agentRunId: z.string().min(1),
      providerToolCallId: z.string().min(1),
      toolCallIdempotencyKey: z.string().min(1),
      idempotencyScopeId: z.string().min(1),
      ...learningItemRecommendationDraftSchema.shape,
    })
    .strict()
    .parse(rawInput);
  const create = async (
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0]
  ) => {
    const [existing] = await tx
      .select({
        id: agentLearningItemRecommendations.id,
        userId: agentLearningItemRecommendations.userId,
        pageId: agentLearningItemRecommendations.pageId,
        status: agentLearningItemRecommendations.status,
      })
      .from(agentLearningItemRecommendations)
      .where(
        and(
          eq(
            agentLearningItemRecommendations.idempotencyScopeId,
            input.idempotencyScopeId
          ),
          eq(
            agentLearningItemRecommendations.toolCallIdempotencyKey,
            input.toolCallIdempotencyKey
          )
        )
      )
      .limit(1);
    if (existing) {
      if (existing.userId !== input.userId || existing.pageId !== input.pageId)
        throw new ApiError(
          403,
          "Không thể truy cập đề xuất LearningItem này.",
          "LEARNING_RECOMMENDATION_FORBIDDEN"
        );
      return {
        recommendationId: existing.id,
        status: "pending" as const,
      };
    }

    const [ownedRun] = await tx
      .select({ id: agentRuns.id })
      .from(agentRuns)
      .where(
        and(
          eq(agentRuns.id, input.agentRunId),
          eq(agentRuns.sourceRunId, input.sourceRunId),
          eq(agentRuns.pageId, input.pageId),
          eq(agentRuns.creatorId, input.userId)
        )
      )
      .limit(1);
    if (!ownedRun)
      throw new ApiError(
        403,
        "AgentRun không thể tạo đề xuất LearningItem này.",
        "LEARNING_RECOMMENDATION_FORBIDDEN"
      );
    const [created] = await tx
      .insert(agentLearningItemRecommendations)
      .values({ ...input, status: "pending" })
      .onConflictDoNothing({
        target: [
          agentLearningItemRecommendations.idempotencyScopeId,
          agentLearningItemRecommendations.toolCallIdempotencyKey,
        ],
      })
      .returning({
        id: agentLearningItemRecommendations.id,
        status: agentLearningItemRecommendations.status,
      });
    if (created)
      return { recommendationId: created.id, status: "pending" as const };
    const [winner] = await tx
      .select({
        id: agentLearningItemRecommendations.id,
        userId: agentLearningItemRecommendations.userId,
        pageId: agentLearningItemRecommendations.pageId,
      })
      .from(agentLearningItemRecommendations)
      .where(
        and(
          eq(
            agentLearningItemRecommendations.idempotencyScopeId,
            input.idempotencyScopeId
          ),
          eq(
            agentLearningItemRecommendations.toolCallIdempotencyKey,
            input.toolCallIdempotencyKey
          )
        )
      )
      .limit(1);
    if (!winner)
      throw new Error("LearningItem recommendation was not created.");
    if (winner.userId !== input.userId || winner.pageId !== input.pageId)
      throw new ApiError(
        409,
        "Khóa idempotency thuộc một đề xuất LearningItem khác.",
        "LEARNING_RECOMMENDATION_IDEMPOTENCY_CONFLICT"
      );
    return { recommendationId: winner.id, status: "pending" as const };
  };
  return transaction ? create(transaction) : db.transaction(create);
}

const storedRecommendationSchema =
  learningItemRecommendationDraftSchema.loose();

async function updateToolCallApproval(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  recommendation: Pick<
    typeof agentLearningItemRecommendations.$inferSelect,
    "agentRunId" | "providerToolCallId" | "toolCallIdempotencyKey"
  >,
  executionId: string | null,
  approvalState: "approved" | "denied"
) {
  await tx
    .update(toolCalls)
    .set({ approvalState })
    .where(
      executionId
        ? eq(toolCalls.executionId, executionId)
        : and(
            eq(toolCalls.agentRunId, recommendation.agentRunId),
            eq(toolCalls.providerCallId, recommendation.providerToolCallId),
            eq(toolCalls.idempotencyKey, recommendation.toolCallIdempotencyKey)
          )
    );
  if (!executionId) return;
  await tx
    .update(toolCallExecutions)
    .set({ approvalState })
    .where(eq(toolCallExecutions.id, executionId));
}

export async function decideAgentLearningItemRecommendation({
  userId,
  recommendationId,
  decision,
}: {
  userId: string;
  recommendationId: string;
  decision: "approve" | "reject";
}) {
  return db.transaction(async (tx) => {
    const [owned] = await tx
      .select({
        recommendation: agentLearningItemRecommendations,
        learningItemId: learningItems.id,
        toolCallExecutionId: toolCalls.executionId,
      })
      .from(agentLearningItemRecommendations)
      .leftJoin(
        learningItems,
        eq(
          learningItems.agentRecommendationId,
          agentLearningItemRecommendations.id
        )
      )
      .leftJoin(
        toolCalls,
        and(
          eq(toolCalls.agentRunId, agentLearningItemRecommendations.agentRunId),
          eq(
            toolCalls.providerCallId,
            agentLearningItemRecommendations.providerToolCallId
          ),
          eq(
            toolCalls.idempotencyKey,
            agentLearningItemRecommendations.toolCallIdempotencyKey
          )
        )
      )
      .where(
        and(
          eq(agentLearningItemRecommendations.id, recommendationId),
          eq(agentLearningItemRecommendations.userId, userId),
          isNotNull(agentLearningItemRecommendations.auditedAt)
        )
      )
      .for("update", { of: [agentLearningItemRecommendations] })
      .limit(1);
    if (!owned)
      throw new ApiError(
        404,
        "Không tìm thấy đề xuất LearningItem.",
        "LEARNING_RECOMMENDATION_NOT_FOUND"
      );

    const recommendation = owned.recommendation;
    if (recommendation.status !== "pending") {
      return {
        recommendationId: recommendation.id,
        status: recommendation.status,
        learningItemId: owned.learningItemId,
      };
    }

    const decidedAt = new Date();
    if (decision === "reject") {
      await tx
        .update(agentLearningItemRecommendations)
        .set({ status: "rejected", decidedAt })
        .where(eq(agentLearningItemRecommendations.id, recommendation.id));
      await updateToolCallApproval(
        tx,
        recommendation,
        owned.toolCallExecutionId,
        "denied"
      );
      return {
        recommendationId: recommendation.id,
        status: "rejected" as const,
        learningItemId: null,
      };
    }

    const validated = storedRecommendationSchema.safeParse(recommendation);
    if (!validated.success)
      throw new ApiError(
        422,
        "Đề xuất LearningItem không còn hợp lệ.",
        "LEARNING_RECOMMENDATION_INVALID"
      );
    const [created] = await tx
      .insert(learningItems)
      .values({
        userId,
        findingId: null,
        agentRecommendationId: recommendation.id,
        category: validated.data.category,
        originalPattern: validated.data.originalPattern,
        targetExpression: validated.data.targetExpression,
        explanationVi: validated.data.explanation,
        sourceContext: validated.data.sourceEvidence,
        status: "active",
      })
      .onConflictDoNothing({ target: learningItems.agentRecommendationId })
      .returning({ id: learningItems.id });
    let learningItemId = created?.id;
    if (!learningItemId) {
      const [existing] = await tx
        .select({ id: learningItems.id })
        .from(learningItems)
        .where(eq(learningItems.agentRecommendationId, recommendation.id))
        .limit(1);
      learningItemId = existing?.id;
    }
    if (!learningItemId)
      throw new Error("Approved LearningItem was not created.");
    await tx
      .update(agentLearningItemRecommendations)
      .set({ status: "approved", decidedAt })
      .where(eq(agentLearningItemRecommendations.id, recommendation.id));
    await updateToolCallApproval(
      tx,
      recommendation,
      owned.toolCallExecutionId,
      "approved"
    );
    return {
      recommendationId: recommendation.id,
      status: "approved" as const,
      learningItemId,
    };
  });
}

export async function loadAgentLearningItemRecommendations(userId: string) {
  return db
    .select({
      recommendation: agentLearningItemRecommendations,
      learningItemId: learningItems.id,
    })
    .from(agentLearningItemRecommendations)
    .leftJoin(
      learningItems,
      eq(
        learningItems.agentRecommendationId,
        agentLearningItemRecommendations.id
      )
    )
    .where(
      and(
        eq(agentLearningItemRecommendations.userId, userId),
        isNotNull(agentLearningItemRecommendations.auditedAt)
      )
    )
    .orderBy(desc(agentLearningItemRecommendations.createdAt));
}
