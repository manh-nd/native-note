import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { pages, personalInstructions, workspaces } from "@/db/schema";
import { ApiError } from "@/lib/api";
import type { PersonalInstructionsSnapshot } from "./index";

export async function loadActivePersonalInstructions(
  userId: string
): Promise<PersonalInstructionsSnapshot | null> {
  const [active] = await db
    .select({
      pageId: pages.id,
      contentRevision: pages.contentRevision,
      snapshot: pages.plainText,
    })
    .from(personalInstructions)
    .innerJoin(pages, eq(personalInstructions.activePageId, pages.id))
    .innerJoin(workspaces, eq(pages.workspaceId, workspaces.id))
    .where(
      and(
        eq(personalInstructions.userId, userId),
        eq(workspaces.userId, userId),
        isNull(pages.deletedAt)
      )
    )
    .limit(1);
  return active ?? null;
}

export async function setActivePersonalInstructions(
  userId: string,
  pageId: string | null
) {
  return db.transaction(async (tx) => {
    if (pageId) {
      const [owned] = await tx
        .select({ id: pages.id })
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
      if (!owned)
        throw new ApiError(
          404,
          "Không tìm thấy Page Instructions.",
          "NOT_FOUND"
        );
    }
    const [setting] = await tx
      .insert(personalInstructions)
      .values({ userId, activePageId: pageId, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: personalInstructions.userId,
        set: { activePageId: pageId, updatedAt: new Date() },
      })
      .returning();
    return setting;
  });
}
