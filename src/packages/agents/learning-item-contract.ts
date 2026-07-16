import { z } from "zod";

export const learningItemRecommendationDraftSchema = z
  .object({
    category: z.enum([
      "grammar",
      "word_choice",
      "collocation",
      "naturalness",
      "register",
      "clarity",
    ]),
    originalPattern: z.string().trim().min(1).max(500),
    targetExpression: z.string().trim().min(1).max(500),
    explanation: z.string().trim().min(1).max(2_000),
    sourceEvidence: z.string().trim().min(1).max(2_000),
  })
  .strict();

export type AgentLearningItemRecommendationDraft = z.infer<
  typeof learningItemRecommendationDraftSchema
>;
