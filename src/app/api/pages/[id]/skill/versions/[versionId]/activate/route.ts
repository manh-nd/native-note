import { NextResponse } from "next/server";
import { apiError, requireUserId } from "@/lib/api";
import { activateSkillVersion } from "@/packages/skills/server";

export async function POST(
  _: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { id, versionId } = await params;
    return NextResponse.json(
      await activateSkillVersion(await requireUserId(), id, versionId)
    );
  } catch (error) {
    return apiError(error);
  }
}
