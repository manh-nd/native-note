import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { learningItems, practiceAttempts, practiceSessions } from "@/db/schema";
import { ApiError, apiError, parseJson, requireUserId } from "@/lib/api";
import { generateStructured } from "@/lib/ai/gemini";
import { liveAssessmentSchema } from "@/lib/ai/schemas";
import { contextFingerprint, nextLearningState } from "@/lib/learning";

const schema = z.object({ transcript: z.string().min(10).max(40_000) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const input = await parseJson(request, schema);
    const [session] = await db.select().from(practiceSessions).where(and(eq(practiceSessions.id, id), eq(practiceSessions.userId, userId), eq(practiceSessions.kind, "live"))).limit(1);
    if (!session) throw new ApiError(404, "Không tìm thấy phiên luyện nói.");
    if (session.completedAt) throw new ApiError(409, "Phiên này đã được đánh giá.");
    const items = await db.select().from(learningItems).where(eq(learningItems.userId, userId));
    const targets = items.filter((item) => session.itemIds.includes(item.id));
    const assessment = await generateStructured(
      liveAssessmentSchema,
      `Targets: ${JSON.stringify(targets.map((item) => ({ id: item.id, target: item.targetExpression })))}\nTranscript:\n${input.transcript}`,
      "Evaluate only the learner's turns. For each target id, decide whether it was used correctly and naturally. Use exact provided UUIDs. Explain briefly in Vietnamese.",
    );
    await db.transaction(async (tx) => {
      await tx.update(practiceSessions).set({ transcript: input.transcript, completedAt: new Date() }).where(eq(practiceSessions.id, session.id));
      for (const result of assessment.items) {
        const item = targets.find((candidate) => candidate.id === result.itemId);
        if (!item) continue;
        const fingerprint = contextFingerprint(result.evidence || input.transcript);
        const [existing] = await tx.select({ id: practiceAttempts.id }).from(practiceAttempts)
          .where(and(eq(practiceAttempts.itemId, item.id), eq(practiceAttempts.contextFingerprint, fingerprint))).limit(1);
        if (existing) continue;
        const state = nextLearningState(item.correctStreak, result.verdict, true);
        await tx.insert(practiceAttempts).values({ sessionId: session.id, itemId: item.id, answer: result.evidence || "Live transcript", contextFingerprint: fingerprint, verdict: result.verdict, feedbackVi: result.feedbackVi });
        await tx.update(learningItems).set({ ...state, updatedAt: new Date() }).where(eq(learningItems.id, item.id));
      }
    });
    return NextResponse.json({ assessment });
  } catch (error) { return apiError(error); }
}
