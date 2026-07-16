import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, parseJson, requireUserId } from "@/lib/api";
import { loadAgentRuns, runAgentDefinition } from "@/packages/agents/server";

const runSchema = z
  .object({
    pageId: z.string().uuid(),
    prompt: z.string().trim().min(1).max(10_000),
  })
  .strict();

async function agentId(params: Promise<{ id: string }>) {
  return (await params).id;
}

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    return NextResponse.json({
      runs: await loadAgentRuns(await requireUserId(), await agentId(params)),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const input = await parseJson(request, runSchema);
    return NextResponse.json(
      {
        run: await runAgentDefinition({
          userId,
          agentId: await agentId(params),
          ...input,
        }),
      },
      { status: 201 }
    );
  } catch (error) {
    return apiError(error);
  }
}
