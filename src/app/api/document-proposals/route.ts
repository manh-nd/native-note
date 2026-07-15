import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, apiError, requireUserId } from "@/lib/api";
import { loadPageDocumentProposals } from "@/packages/document-proposals";

const querySchema = z.object({ pageId: z.string().uuid() });

export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    const parsed = querySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams)
    );
    if (!parsed.success)
      throw new ApiError(400, "Dữ liệu gửi lên không hợp lệ.", "INVALID_INPUT");
    return NextResponse.json(
      await loadPageDocumentProposals(userId, parsed.data.pageId)
    );
  } catch (error) {
    return apiError(error);
  }
}
