import { and, asc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { pages } from "@/db/schema";
import { apiError, parseJson, requireUserId } from "@/lib/api";
import { ensureWorkspace } from "@/lib/ownership";

const createSchema = z.object({ title: z.string().trim().min(1).max(120).default("Không có tiêu đề"), parentId: z.string().uuid().nullable().optional() });

export async function GET() {
  try {
    const userId = await requireUserId();
    const workspace = await ensureWorkspace(userId);
    const result = await db.select().from(pages)
      .where(and(eq(pages.workspaceId, workspace.id), isNull(pages.deletedAt)))
      .orderBy(asc(pages.position), asc(pages.createdAt));
    return NextResponse.json({ workspace, pages: result });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const input = await parseJson(request, createSchema);
    const workspace = await ensureWorkspace(userId);
    if (input.parentId) {
      const [parent] = await db.select({ id: pages.id }).from(pages)
        .where(and(eq(pages.id, input.parentId), eq(pages.workspaceId, workspace.id), isNull(pages.deletedAt))).limit(1);
      if (!parent) return NextResponse.json({ error: "Trang cha không hợp lệ." }, { status: 400 });
    }
    const [page] = await db.insert(pages).values({ workspaceId: workspace.id, title: input.title, parentId: input.parentId ?? null }).returning();
    return NextResponse.json({ page }, { status: 201 });
  } catch (error) { return apiError(error); }
}
