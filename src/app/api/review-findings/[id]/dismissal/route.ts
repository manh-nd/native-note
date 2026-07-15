import { NextResponse } from "next/server";
import { apiError, requireUserId } from "@/lib/api";
import { dismissReviewFinding } from "@/packages/document-proposals";

export async function POST(
  _: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    return NextResponse.json(await dismissReviewFinding(userId, id));
  } catch (error) {
    return apiError(error);
  }
}
