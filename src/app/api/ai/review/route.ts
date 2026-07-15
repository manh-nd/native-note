import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, parseJson, requireUserId } from "@/lib/api";
import { generateStructured, getTextModel } from "@/lib/ai/gemini";
import { reviewResponseSchema } from "@/lib/ai/schemas";
import { ownedPage } from "@/lib/ownership";
import { rateLimit } from "@/lib/rate-limit";
import { createDocumentTextIndex } from "@/packages/document-editor";
import {
  createReviewDocumentProposals,
  type ReviewFindingDraft,
} from "@/packages/document-proposals";

const inputSchema = z.object({
  pageId: z.string().uuid(),
});

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    rateLimit(`review:${userId}`, 10);
    const input = await parseJson(request, inputSchema);
    const page = await ownedPage(userId, input.pageId);
    const textIndex = createDocumentTextIndex(page.content);
    const snapshot = textIndex.text;
    if (snapshot.trim().length < 3 || snapshot.length > 20_000)
      return NextResponse.json(
        { error: "Hãy chọn từ 3 đến 20.000 ký tự để review." },
        { status: 400 }
      );
    const result = await generateStructured(
      reviewResponseSchema,
      JSON.stringify({
        blocks: textIndex.blocks.map(({ blockId, text }) => ({
          blockId,
          text,
        })),
      }),
      "You are a supportive English writing coach for Vietnamese B1-C1 learners. Review only the supplied blocks. Each finding must name exactly one blockId and use zero-based from/to offsets in that block's text. Every original must exactly equal that block's text.slice(from, to); never span blocks. Explain briefly in Vietnamese, preserve the writer's meaning and voice, prefer idiomatic native phrasing, and do not invent errors."
    );
    const blocks = new Map(
      textIndex.blocks.map((block) => [block.blockId, block])
    );
    const valid = result.findings.filter((item) => {
      const block = blocks.get(item.blockId);
      return Boolean(
        block &&
        item.to >= item.from &&
        block.text.slice(item.from, item.to) === item.original
      );
    });
    const stored = await createReviewDocumentProposals({
      page,
      userId,
      model: getTextModel(),
      snapshot,
      findings: valid satisfies ReviewFindingDraft[],
    });
    return NextResponse.json({
      findings: stored,
      contentRevision: page.contentRevision,
    });
  } catch (error) {
    return apiError(error);
  }
}
