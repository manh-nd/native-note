import { NextResponse } from "next/server";
import { apiError, requireUserId } from "@/lib/api";
import {
  acceptDocumentProposal,
  rejectDocumentProposal,
} from "@/packages/document-proposals";

export async function POST(
  _: Request,
  { params }: { params: Promise<{ id: string; decision: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id, decision } = await params;
    if (decision === "accept")
      return NextResponse.json(await acceptDocumentProposal(userId, id));
    if (decision === "reject")
      return NextResponse.json(await rejectDocumentProposal(userId, id));
    return NextResponse.json(
      { error: "Thao tác không tồn tại." },
      { status: 404 }
    );
  } catch (error) {
    return apiError(error);
  }
}
