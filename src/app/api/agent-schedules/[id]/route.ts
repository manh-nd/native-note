import { NextResponse } from "next/server";
import { apiError, parseJson, requireUserId } from "@/lib/api";
import { updateAgentSchedule } from "@/packages/agents/schedules";
import { agentScheduleInputSchema } from "../schema";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const input = await parseJson(request, agentScheduleInputSchema);
    return NextResponse.json({
      schedule: await updateAgentSchedule({
        userId,
        scheduleId: (await params).id,
        ...input,
      }),
    });
  } catch (error) {
    return apiError(error);
  }
}
