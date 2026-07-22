import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, parseJson, requireUserId } from "@/lib/api";
import { applyReviewFindings } from "@/packages/document-proposals";

const inputSchema = z
  .object({
    findingIds: z.array(z.string().uuid()).min(1).max(30),
  })
  .strict()
  .refine(
    ({ findingIds }) => new Set(findingIds).size === findingIds.length,
    "Finding IDs must be unique."
  );

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const { findingIds } = await parseJson(request, inputSchema);
    return NextResponse.json(await applyReviewFindings(userId, findingIds));
  } catch (error) {
    return apiError(error);
  }
}
