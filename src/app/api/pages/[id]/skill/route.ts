import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, parseJson, requireUserId } from "@/lib/api";
import {
  loadOwnedPageSkill,
  markPageAsSkill,
  unmarkPageAsSkill,
  updateSkillMetadata,
} from "@/packages/skills/server";

const metadataFields = {
  inputScope: z.enum(["selection", "block", "page"]),
  outputMode: z.enum(["proposal", "read_only"]),
  status: z.enum(["draft", "disabled"]),
  allowedTools: z
    .array(z.string().trim().min(1).max(64))
    .max(16)
    .transform((tools) => [...new Set(tools)]),
  approvalPolicy: z.literal("required"),
  showInEditorMenu: z.boolean(),
};

const markSchema = z.object(metadataFields).partial().strict();
const updateSchema = markSchema.refine(
  (input) => Object.keys(input).length > 0,
  "Cần cung cấp metadata để cập nhật Skill."
);

async function pageId(params: Promise<{ id: string }>) {
  return (await params).id;
}

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    return NextResponse.json({
      skill: await loadOwnedPageSkill(userId, await pageId(params)),
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
    const result = await markPageAsSkill(
      userId,
      await pageId(params),
      await parseJson(request, markSchema)
    );
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const skill = await updateSkillMetadata(
      userId,
      await pageId(params),
      await parseJson(request, updateSchema)
    );
    return NextResponse.json({ skill });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    return NextResponse.json(
      await unmarkPageAsSkill(userId, await pageId(params))
    );
  } catch (error) {
    return apiError(error);
  }
}
