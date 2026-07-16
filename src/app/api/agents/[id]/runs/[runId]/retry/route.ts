import { NextResponse } from "next/server";
import { apiError, requireUserId } from "@/lib/api";
import { retryAgentRun } from "@/packages/agents/server";

type Params = Promise<{ id: string; runId: string }>;

export async function POST(_: Request, { params }: { params: Params }) {
  try {
    const { id, runId } = await params;
    return NextResponse.json(
      {
        run: await retryAgentRun({
          userId: await requireUserId(),
          agentId: id,
          runId,
        }),
      },
      { status: 201 }
    );
  } catch (error) {
    return apiError(error);
  }
}
