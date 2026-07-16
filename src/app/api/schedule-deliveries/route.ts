import { NextResponse } from "next/server";
import { apiError, requireUserId } from "@/lib/api";
import { listFailedScheduleDeliveries } from "@/packages/agents/schedules";

export async function GET() {
  try {
    return NextResponse.json({
      deliveries: await listFailedScheduleDeliveries(await requireUserId()),
    });
  } catch (error) {
    return apiError(error);
  }
}
