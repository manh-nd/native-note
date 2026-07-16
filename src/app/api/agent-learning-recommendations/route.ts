import { NextResponse } from "next/server";
import { apiError, requireUserId } from "@/lib/api";
import { loadAgentLearningItemRecommendations } from "@/packages/agents/learning-items";

export async function GET() {
  try {
    return NextResponse.json({
      recommendations: await loadAgentLearningItemRecommendations(
        await requireUserId()
      ),
    });
  } catch (error) {
    return apiError(error);
  }
}
