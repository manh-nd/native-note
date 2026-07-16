import { NextResponse } from "next/server";
import { apiError, requireUserId } from "@/lib/api";
import {
  loadSkillVersionHistory,
  publishSkillVersion,
} from "@/packages/skills/server";

async function pageId(params: Promise<{ id: string }>) {
  return (await params).id;
}

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    return NextResponse.json(
      await loadSkillVersionHistory(await requireUserId(), await pageId(params))
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(
  _: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await publishSkillVersion(
      await requireUserId(),
      await pageId(params)
    );
    return NextResponse.json(result, { status: result.published ? 201 : 200 });
  } catch (error) {
    return apiError(error);
  }
}
