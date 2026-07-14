import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { learningItems, practiceAttempts, practiceSessions } from "@/db/schema";
import { ApiError, apiError, parseJson, requireUserId } from "@/lib/api";
import { generateStructured } from "@/lib/ai/gemini";
import { attemptAssessmentSchema } from "@/lib/ai/schemas";
import { contextFingerprint, nextLearningState } from "@/lib/learning";
import { rateLimit } from "@/lib/rate-limit";

const schema = z.object({ answer: z.string().trim().min(3).max(3000), itemId: z.string().uuid() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    rateLimit(`attempt:${userId}`, 20);
    const { id } = await params;
    const input = await parseJson(request, schema);
    const [session] = await db.select().from(practiceSessions).where(and(eq(practiceSessions.id, id), eq(practiceSessions.userId, userId))).limit(1);
    if (!session || !session.itemIds.includes(input.itemId)) throw new ApiError(404, "Phiên luyện tập không hợp lệ.");
    const [item] = await db.select().from(learningItems).where(and(eq(learningItems.id, input.itemId), eq(learningItems.userId, userId))).limit(1);
    if (!item) throw new ApiError(404, "Nội dung luyện tập không tồn tại.");
    const assessment = await generateStructured(
      attemptAssessmentSchema,
      `Task: ${session.prompt}\nTarget expression: ${item.targetExpression}\nOriginal issue: ${item.originalPattern}\nLearner answer: ${input.answer}`,
      "Assess whether the learner used the target correctly and naturally in context. Be strict but encouraging. Explain in Vietnamese, preserve meaning, and ask a contextual English follow-up.",
    );
    const fingerprint = contextFingerprint(input.answer);
    const [existing] = await db.select({ id: practiceAttempts.id }).from(practiceAttempts)
      .where(and(eq(practiceAttempts.itemId, item.id), eq(practiceAttempts.contextFingerprint, fingerprint))).limit(1);
    const state = nextLearningState(item.correctStreak, assessment.verdict, !existing);
    if (!existing) {
      await db.insert(practiceAttempts).values({ sessionId: session.id, itemId: item.id, answer: input.answer, contextFingerprint: fingerprint, verdict: assessment.verdict, feedbackVi: assessment.feedbackVi });
      await db.update(learningItems).set({ ...state, updatedAt: new Date() }).where(eq(learningItems.id, item.id));
    }
    return NextResponse.json({ assessment, progress: existing ? { duplicateContext: true, correctStreak: item.correctStreak, status: item.status } : { duplicateContext: false, ...state } });
  } catch (error) { return apiError(error); }
}
