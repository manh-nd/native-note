import { z } from "zod";

export const categorySchema = z.enum([
  "grammar",
  "word_choice",
  "collocation",
  "naturalness",
  "register",
  "clarity",
]);
export const findingSchema = z.object({
  blockId: z.string().uuid(),
  category: categorySchema,
  original: z.string().min(1).max(500),
  suggestion: z.string().min(1).max(1000),
  explanationVi: z.string().min(1).max(1000),
  exampleEn: z.string().min(1).max(1000),
  register: z.string().min(1).max(80),
  confidence: z.number().min(0).max(1),
  from: z.number().int().nonnegative(),
  to: z.number().int().positive(),
});
export const reviewResponseSchema = z.object({
  findings: z.array(findingSchema).max(30),
});

export const transformResponseSchema = z.object({
  result: z.string().min(1).max(5000),
  explanationVi: z.string().min(1).max(1000),
  alternatives: z.array(z.string().max(1000)).max(4).default([]),
});

export const selectionTransformSegmentSchema = z.object({
  id: z.string().min(1).max(120),
  result: z
    .string()
    .min(1)
    .max(5000)
    .refine(
      (value) => !/[\r\n]/.test(value),
      "Mỗi kết quả phải nằm trên một dòng."
    ),
  category: categorySchema,
  explanationVi: z.string().min(1).max(1000),
  exampleEn: z.string().min(1).max(1000),
  register: z.string().min(1).max(80),
  confidence: z.number().min(0).max(1),
});

export const selectionTransformResponseSchema = z.object({
  summaryVi: z.string().min(1).max(1000),
  segments: z.array(selectionTransformSegmentSchema).min(1).max(30),
});

export function selectionResponseMatchesIds(
  response: z.infer<typeof selectionTransformResponseSchema>,
  expectedIds: string[]
) {
  const actual = response.segments.map((segment) => segment.id);
  return (
    actual.length === expectedIds.length &&
    new Set(actual).size === actual.length &&
    actual.every((id) => expectedIds.includes(id)) &&
    expectedIds.every((id) => actual.includes(id))
  );
}

export const practicePromptSchema = z.object({
  promptEn: z.string().min(1).max(1500),
  instructionVi: z.string().min(1).max(1000),
});

export const attemptAssessmentSchema = z.object({
  verdict: z.enum(["correct", "partially_correct", "incorrect"]),
  feedbackVi: z.string().min(1).max(1000),
  improvedAnswer: z.string().min(1).max(1500),
  followUpEn: z.string().min(1).max(1000),
});

export const liveAssessmentSchema = z.object({
  summaryVi: z.string().min(1).max(1500),
  items: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        verdict: z.enum(["correct", "partially_correct", "incorrect"]),
        evidence: z.string().max(1000),
        feedbackVi: z.string().max(1000),
      })
    )
    .max(5),
});
