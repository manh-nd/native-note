import { NextResponse } from "next/server";
import { apiError, requireUserId } from "@/lib/api";
import { cancelAgentRun } from "@/packages/agents/server";

type Params = Promise<{ id: string; runId: string }>;

export async function DELETE(_: Request, { params }: { params: Params }) {
  try {
    const { id, runId } = await params;
    return NextResponse.json({
      run: await cancelAgentRun(await requireUserId(), id, runId),
    });
  } catch (error) {
    return apiError(error);
  }
}
