import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { ApiError, apiError } from "@/lib/api";
import {
  dispatchDueAgentSchedules,
  retryFailedScheduleDeliveries,
} from "@/packages/agents/schedules";

function authorizeScheduler(request: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = request.headers
    .get("authorization")
    ?.replace(/^Bearer /, "");
  if (!secret || !supplied)
    throw new ApiError(401, "Unauthorized.", "UNAUTHORIZED");
  const expectedBuffer = Buffer.from(secret);
  const suppliedBuffer = Buffer.from(supplied);
  if (
    expectedBuffer.length !== suppliedBuffer.length ||
    !timingSafeEqual(expectedBuffer, suppliedBuffer)
  )
    throw new ApiError(401, "Unauthorized.", "UNAUTHORIZED");
}

export async function POST(request: Request) {
  try {
    authorizeScheduler(request);
    const retried = await retryFailedScheduleDeliveries();
    const due = await dispatchDueAgentSchedules();
    return NextResponse.json({ retried, due });
  } catch (error) {
    return apiError(error);
  }
}
