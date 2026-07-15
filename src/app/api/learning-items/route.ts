import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, parseJson, requireUserId } from "@/lib/api";
import { createLearningItemFromFinding } from "@/packages/document-proposals";

const inputSchema = z.object({ findingId: z.string().uuid() }).strict();

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const { findingId } = await parseJson(request, inputSchema);
    return NextResponse.json(
      await createLearningItemFromFinding(userId, findingId),
      { status: 201 }
    );
  } catch (error) {
    return apiError(error);
  }
}
