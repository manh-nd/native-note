import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { findings, reviews } from "@/db/schema";
import { apiError, parseJson, requireUserId } from "@/lib/api";
import { generateStructured, getTextModel } from "@/lib/ai/gemini";
import { reviewResponseSchema } from "@/lib/ai/schemas";
import { ownedPage } from "@/lib/ownership";
import { rateLimit } from "@/lib/rate-limit";

const inputSchema = z.object({
  pageId: z.string().uuid(),
  scope: z
    .object({
      from: z.number().int().nonnegative(),
      to: z.number().int().positive(),
    })
    .nullable()
    .default(null),
});

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    rateLimit(`review:${userId}`, 10);
    const input = await parseJson(request, inputSchema);
    const page = await ownedPage(userId, input.pageId);
    const from = input.scope?.from ?? 0;
    const to = input.scope?.to ?? page.plainText.length;
    const snapshot = page.plainText.slice(from, to);
    if (snapshot.trim().length < 3 || snapshot.length > 20_000)
      return NextResponse.json(
        { error: "Hãy chọn từ 3 đến 20.000 ký tự để review." },
        { status: 400 }
      );
    const result = await generateStructured(
      reviewResponseSchema,
      `Review the following English text. Offsets must be zero-based character offsets in this exact text. Only report meaningful issues.\n\nTEXT:\n${snapshot}`,
      "You are a supportive English writing coach for Vietnamese B1-C1 learners. Explain briefly in Vietnamese. Preserve the writer's meaning and voice. Prefer idiomatic native phrasing. Do not invent errors. Every original must exactly equal TEXT.slice(from,to)."
    );
    const valid = result.findings.filter(
      (item) => snapshot.slice(item.from, item.to) === item.original
    );
    const stored = await db.transaction(async (tx) => {
      const [review] = await tx
        .insert(reviews)
        .values({
          pageId: page.id,
          pageVersion: page.version,
          scopeFrom: from,
          scopeTo: to,
          snapshot,
          model: getTextModel(),
        })
        .returning();
      if (!valid.length) return [];
      return tx
        .insert(findings)
        .values(
          valid.map((item) => ({
            ...item,
            from: item.from + from,
            to: item.to + from,
            reviewId: review.id,
          }))
        )
        .returning();
    });
    return NextResponse.json({ findings: stored, pageVersion: page.version });
  } catch (error) {
    return apiError(error);
  }
}
