import { describe, expect, it, vi } from "vitest";

vi.mock("@/packages/agents/learning-items", () => ({
  createAgentLearningItemRecommendation: vi.fn(),
}));

import {
  CREATE_LEARNING_ITEM_RECOMMENDATION_TOOL,
  createInitialToolRegistry,
} from "../index";

const context = {
  userId: "user-1",
  currentPageId: "11111111-1111-4111-8111-111111111111",
  provenance: {
    sourceRunId: "22222222-2222-4222-8222-222222222222",
    agentRunId: "33333333-3333-4333-8333-333333333333",
    providerToolCallId: "provider-call-1",
    idempotencyKey: "idempotency-1",
    idempotencyScopeId: "33333333-3333-4333-8333-333333333333",
  },
};

const input = {
  category: "grammar" as const,
  originalPattern: "I has",
  targetExpression: "I have",
  explanation: "Use have with the first-person subject I.",
  sourceEvidence: "The Page contains: I has a plan.",
};

describe("create LearningItem recommendation Agent Tool", () => {
  it("creates a pending, approval-required recommendation with redacted audit content", async () => {
    const createLearningItemRecommendation = vi.fn(async () => ({
      recommendationId: "44444444-4444-4444-8444-444444444444",
      status: "pending" as const,
    }));
    const tools = createInitialToolRegistry({
      createLearningItemRecommendation,
    });
    const transaction = {} as never;

    await expect(
      tools.execute(
        CREATE_LEARNING_ITEM_RECOMMENDATION_TOOL,
        input,
        context,
        [CREATE_LEARNING_ITEM_RECOMMENDATION_TOOL],
        { transaction }
      )
    ).resolves.toMatchObject({
      output: {
        recommendationId: "44444444-4444-4444-8444-444444444444",
        status: "pending",
      },
      auditInput: {
        category: "grammar",
        originalPattern: "[REDACTED:SENSITIVE_LEARNING_CONTENT]",
        targetExpression: "[REDACTED:SENSITIVE_LEARNING_CONTENT]",
        explanation: "[REDACTED:SENSITIVE_LEARNING_CONTENT]",
        sourceEvidence: "[REDACTED:SENSITIVE_LEARNING_CONTENT]",
      },
      snapshot: { risk: "medium", approval: "required" },
    });
    expect(createLearningItemRecommendation).toHaveBeenCalledWith(
      {
        userId: context.userId,
        pageId: context.currentPageId,
        sourceRunId: context.provenance.sourceRunId,
        agentRunId: context.provenance.agentRunId,
        providerToolCallId: context.provenance.providerToolCallId,
        toolCallIdempotencyKey: context.provenance.idempotencyKey,
        idempotencyScopeId: context.provenance.idempotencyScopeId,
        ...input,
      },
      transaction
    );
  });

  it("rejects invalid or unauditable recommendations before persistence", async () => {
    const createLearningItemRecommendation = vi.fn();
    const tools = createInitialToolRegistry({
      createLearningItemRecommendation,
    });

    await expect(
      tools.execute(
        CREATE_LEARNING_ITEM_RECOMMENDATION_TOOL,
        { ...input, category: "generic_rewrite", trustAgent: true },
        context,
        [CREATE_LEARNING_ITEM_RECOMMENDATION_TOOL]
      )
    ).rejects.toMatchObject({ code: "TOOL_INPUT_INVALID" });
    await expect(
      tools.execute(
        CREATE_LEARNING_ITEM_RECOMMENDATION_TOOL,
        input,
        { userId: context.userId, currentPageId: context.currentPageId },
        [CREATE_LEARNING_ITEM_RECOMMENDATION_TOOL]
      )
    ).rejects.toMatchObject({ code: "TOOL_OWNERSHIP_DENIED" });
    expect(createLearningItemRecommendation).not.toHaveBeenCalled();
  });
});
