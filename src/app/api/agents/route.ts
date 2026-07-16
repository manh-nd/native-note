import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, parseJson, requireUserId } from "@/lib/api";
import { AGENT_TOOLS } from "@/packages/agents";
import {
  createAgentDefinition,
  listAgentDefinitions,
} from "@/packages/agents/server";

const createAgentSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    instructionsPageId: z.string().uuid(),
    skillVersionIds: z
      .array(z.string().uuid())
      .max(32)
      .transform((ids) => [...new Set(ids)]),
    allowedTools: z
      .array(z.enum(AGENT_TOOLS))
      .max(AGENT_TOOLS.length)
      .transform((tools) => [...new Set(tools)]),
    modelPolicy: z
      .object({ model: z.string().trim().min(1).max(120) })
      .strict(),
    maxSteps: z.number().int().min(1).max(6),
  })
  .strict();

export async function GET() {
  try {
    return NextResponse.json({
      agents: await listAgentDefinitions(await requireUserId()),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const input = await parseJson(request, createAgentSchema);
    return NextResponse.json(
      { agent: await createAgentDefinition({ userId, ...input }) },
      { status: 201 }
    );
  } catch (error) {
    return apiError(error);
  }
}
