import { NextResponse } from "next/server";
import { apiError, requireUserId } from "@/lib/api";
import { loadScheduledProposalInbox } from "@/packages/document-proposals";

export async function GET() {
  try {
    return NextResponse.json({
      proposals: await loadScheduledProposalInbox(await requireUserId()),
    });
  } catch (error) {
    return apiError(error);
  }
}
