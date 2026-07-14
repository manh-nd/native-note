import { and, asc, desc, eq, lte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { learningItems, practiceSessions } from "@/db/schema";
import { apiError, requireUserId } from "@/lib/api";
import { createLiveToken, LIVE_MODEL } from "@/lib/ai/gemini";
import { rateLimit } from "@/lib/rate-limit";

export async function POST() {
  try {
    const userId = await requireUserId();
    rateLimit(`live:${userId}`, 3, 10 * 60_000);
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
      .limit(5);
    if (!items.length)
      return NextResponse.json({ hasDueItems: false, token: null });
    const targets = items
      .map((item) => `${item.id}: ${item.targetExpression}`)
      .join("\n");
    const instruction = `You are a friendly native English speaking coach. Run a realistic role-play for a B1-C1 learner. Naturally create chances for the learner to use these expressions, but never reveal them as answers:\n${targets}\nSpeak only English, keep turns short, correct gently after the learner attempts, and end within 10 minutes.`;
    const token = await createLiveToken(instruction);
    const [session] = await db
      .insert(practiceSessions)
      .values({
        userId,
        kind: "live",
        prompt: "Role-play chủ động với các cụm từ cần ôn",
        itemIds: items.map((item) => item.id),
      })
      .returning();
    return NextResponse.json({
      token,
      sessionId: session.id,
      model: LIVE_MODEL,
      expiresInSeconds: 660,
    });
  } catch (error) {
    return apiError(error);
  }
}
