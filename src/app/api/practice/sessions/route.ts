import { and, asc, desc, eq, lte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { learningItems, practiceSessions } from "@/db/schema";
import { apiError, requireUserId } from "@/lib/api";
import { generateStructured } from "@/lib/ai/gemini";
import { practicePromptSchema } from "@/lib/ai/schemas";
import { rateLimit } from "@/lib/rate-limit";

export async function POST() {
  try {
    const userId = await requireUserId();
    rateLimit(`practice:${userId}`, 10);
    const items = await db
      .select()
      .from(learningItems)
      .where(
        and(
          eq(learningItems.userId, userId),
          eq(learningItems.status, "active"),
          lte(learningItems.dueAt, new Date())
        )
      )
      .orderBy(desc(learningItems.priority), asc(learningItems.dueAt))
      .limit(3);
    if (!items.length)
      return NextResponse.json({ hasDueItems: false, items: [] });
    const targets = items.map((item) => ({
      id: item.id,
      target: item.targetExpression,
      issue: item.originalPattern,
    }));
    const generated = await generateStructured(
      practicePromptSchema,
      `Create one realistic open-ended writing situation that naturally requires these targets. Do not reveal a model answer:\n${JSON.stringify(targets)}`,
      "You design active English practice for Vietnamese B1-C1 learners. The learner must write 1-3 original sentences. Make the English scenario natural and explain the task briefly in Vietnamese."
    );
    const prompt = `${generated.instructionVi}\n\n${generated.promptEn}`;
    const [session] = await db
      .insert(practiceSessions)
      .values({
        userId,
        kind: "writing",
        prompt,
        itemIds: items.map((item) => item.id),
      })
      .returning();
    return NextResponse.json({
      session,
      items: items.map(({ id, category, correctStreak }) => ({
        id,
        category,
        correctStreak,
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}
