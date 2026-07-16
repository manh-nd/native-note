import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, parseJson, requireUserId } from "@/lib/api";
import {
  loadActivePersonalInstructions,
  setActivePersonalInstructions,
} from "@/packages/instructions/server";

const inputSchema = z.object({ pageId: z.string().uuid().nullable() });

export async function GET() {
  try {
    const userId = await requireUserId();
    return NextResponse.json({
      instructions: await loadActivePersonalInstructions(userId),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const userId = await requireUserId();
    const { pageId } = await parseJson(request, inputSchema);
    const setting = await setActivePersonalInstructions(userId, pageId);
    return NextResponse.json({ setting });
  } catch (error) {
    return apiError(error);
  }
}
