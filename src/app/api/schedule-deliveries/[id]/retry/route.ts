import { NextResponse } from "next/server";
import { apiError, requireUserId } from "@/lib/api";
import { retryFailedScheduleDelivery } from "@/packages/agents/schedules";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    return NextResponse.json({
      delivery: await retryFailedScheduleDelivery({
        userId: await requireUserId(),
        deliveryId: id,
      }),
    });
  } catch (error) {
    return apiError(error);
  }
}
