import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requireUserId } from "@/lib/api";
import { decideAgentLearningItemRecommendation } from "@/packages/agents/learning-items";

type Params = Promise<{ id: string; decision: string }>;

export async function POST(_: Request, { params }: { params: Params }) {
  try {
    const { id, decision: rawDecision } = await params;
    const recommendationId = z.string().uuid().parse(id);
    const decision = z.enum(["approve", "reject"]).parse(rawDecision);
    return NextResponse.json({
      recommendation: await decideAgentLearningItemRecommendation({
        userId: await requireUserId(),
        recommendationId,
        decision,
      }),
    });
  } catch (error) {
    return apiError(error);
  }
}
