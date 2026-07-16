import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, apiError, parseJson, requireUserId } from "@/lib/api";
import { ownedPage } from "@/lib/ownership";
import { rateLimit } from "@/lib/rate-limit";
import { runSelectionSkill } from "@/packages/skills/server";

const segmentSchema = z.object({
  id: z.string().min(1).max(120),
  from: z.number().int().nonnegative(),
  to: z.number().int().positive(),
  text: z
    .string()
    .min(1)
    .max(5000)
    .refine((value) => !/[\r\n]/.test(value)),
  nodeType: z.string().min(1).max(40),
  blockId: z.string().uuid(),
  blockFrom: z.number().int().nonnegative(),
  blockTo: z.number().int().positive(),
});

const inputSchema = z
  .object({
    skillPageId: z.string().uuid(),
    scope: z.enum(["selection", "block", "page"]).default("selection"),
    contextSummary: z.string().max(1200).optional(),
    pageId: z.string().uuid(),
    contentRevision: z.number().int().positive(),
    snapshot: z.string().min(1).max(5030),
    segments: z.array(segmentSchema).min(1).max(30),
  })
  .superRefine((value, context) => {
    if (
      value.segments.reduce((sum, segment) => sum + segment.text.length, 0) >
      5000
    )
      context.addIssue({ code: "custom", message: "Selection is too long." });
  });

function validateSelectionAgainstPage(
  pageText: string,
  input: z.infer<typeof inputSchema>
) {
  let previousTo = -1;
  const ids = new Set<string>();
  for (const segment of input.segments) {
    if (
      ids.has(segment.id) ||
      segment.from >= segment.to ||
      segment.from < previousTo ||
      pageText.slice(segment.from, segment.to) !== segment.text
    )
      throw new ApiError(
        409,
        "Đoạn được chọn đã thay đổi. Hãy chọn lại và thử Skill một lần nữa.",
        "STALE_SELECTION"
      );
    ids.add(segment.id);
    previousTo = segment.to;
  }
  if (
    input.snapshot !== input.segments.map((segment) => segment.text).join("\n")
  )
    throw new ApiError(
      409,
      "Snapshot của đoạn chọn không còn khớp.",
      "STALE_SELECTION"
    );
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    rateLimit(`skill-run:${userId}`, 20);
    const input = await parseJson(request, inputSchema);
    const page = await ownedPage(userId, input.pageId);
    if (input.contentRevision !== page.contentRevision)
      throw new ApiError(
        409,
        "Trang đã thay đổi. Hãy thử lại trên phiên bản mới nhất.",
        "CONTENT_REVISION_CONFLICT"
      );
    validateSelectionAgainstPage(page.plainText, input);
    return NextResponse.json(
      await runSelectionSkill({
        userId,
        skillPageId: input.skillPageId,
        page,
        snapshot: input.snapshot,
        segments: input.segments.map(
          ({ id, text, nodeType, blockId, blockFrom, blockTo }) => ({
            id,
            text,
            nodeType,
            blockId,
            blockFrom,
            blockTo,
            result: text,
          })
        ),
        scope: input.scope,
        contextSummary: input.contextSummary,
      })
    );
  } catch (error) {
    return apiError(error);
  }
}
