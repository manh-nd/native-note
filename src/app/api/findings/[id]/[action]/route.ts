import { NextResponse } from "next/server";
import { ApiError, apiError, requireUserId } from "@/lib/api";
import {
  applyFinding,
  dismissFinding,
  saveFinding,
} from "@/packages/document-proposals";

export async function POST(
  _: Request,
  { params }: { params: Promise<{ id: string; action: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id, action } = await params;
    if (action === "apply")
      return NextResponse.json(await applyFinding(userId, id));
    if (action === "save")
      return NextResponse.json(await saveFinding(userId, id));
    if (action === "dismiss")
      return NextResponse.json(await dismissFinding(userId, id));
    throw new ApiError(404, "Thao tác không tồn tại.");
  } catch (error) {
    return apiError(error);
  }
}
