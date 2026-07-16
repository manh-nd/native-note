import { NextResponse } from "next/server";
import { apiError, parseJson, requireUserId } from "@/lib/api";
import {
  createAgentSchedule,
  listAgentSchedules,
} from "@/packages/agents/schedules";
import { agentScheduleInputSchema } from "./schema";

export async function GET() {
  try {
    return NextResponse.json({
      schedules: await listAgentSchedules(await requireUserId()),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const input = await parseJson(request, agentScheduleInputSchema);
    return NextResponse.json(
      { schedule: await createAgentSchedule({ userId, ...input }) },
      { status: 201 }
    );
  } catch (error) {
    return apiError(error);
  }
}
