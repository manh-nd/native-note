import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { pages, workspaces } from "@/db/schema";
import { ApiError } from "./api";
import { migratePageStoredDocument } from "./page-document";

export async function ownedPage(userId: string, pageId: string) {
  const [page] = await db
    .select({ page: pages })
    .from(pages)
    .innerJoin(workspaces, eq(pages.workspaceId, workspaces.id))
    .where(
      and(
        eq(pages.id, pageId),
        eq(workspaces.userId, userId),
        isNull(pages.deletedAt)
      )
    )
    .limit(1);
  if (!page) throw new ApiError(404, "Không tìm thấy trang.", "NOT_FOUND");
  return migratePageStoredDocument(page.page);
}

export async function ensureWorkspace(userId: string) {
  const [existing] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.userId, userId))
    .limit(1);
  if (existing) return existing;
  const [created] = await db.insert(workspaces).values({ userId }).returning();
  return created;
}
