import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { pages, skills, workspaces } from "@/db/schema";
import { ApiError } from "@/lib/api";
import { createEmptyStoredDocument } from "@/packages/documents";
import { createSkillMetadata, type SkillMetadata } from "./skill-metadata";

export type ManagedSkill = typeof skills.$inferSelect;

async function assertOwnedPage(userId: string, pageId: string) {
  const [page] = await db
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
  if (!page) throw new ApiError(404, "Không tìm thấy trang.", "NOT_FOUND");
  return page;
}

export async function markPageAsSkill(
  userId: string,
  pageId: string,
  metadata: Partial<SkillMetadata> = {}
) {
  await assertOwnedPage(userId, pageId);
  const [created] = await db
    .insert(skills)
    .values({ pageId, creatorId: userId, ...createSkillMetadata(metadata) })
    .onConflictDoNothing({ target: skills.pageId })
    .returning();
  if (created) return { skill: created, created: true };

  const [existing] = await db
    .select()
    .from(skills)
    .where(eq(skills.pageId, pageId))
    .limit(1);
  if (!existing) {
    throw new ApiError(
      409,
      "Không thể đánh dấu trang là Skill.",
      "SKILL_CONFLICT"
    );
  }
  return { skill: existing, created: false };
}

export async function createSkillPage({
  userId,
  workspaceId,
  title,
  parentId,
}: {
  userId: string;
  workspaceId: string;
  title: string;
  parentId?: string | null;
}) {
  return db.transaction(async (tx) => {
    if (parentId) {
      const [parent] = await tx
        .select({ id: pages.id })
        .from(pages)
        .where(
          and(
            eq(pages.id, parentId),
            eq(pages.workspaceId, workspaceId),
            isNull(pages.deletedAt)
          )
        )
        .limit(1);
      if (!parent) {
        throw new ApiError(400, "Trang cha không hợp lệ.", "INVALID_PARENT");
      }
    }
    const storedDocument = createEmptyStoredDocument();
    const [page] = await tx
      .insert(pages)
      .values({
        workspaceId,
        title,
        parentId: parentId ?? null,
        content: storedDocument.content,
        documentSchemaVersion: storedDocument.schemaVersion,
        plainText: storedDocument.plainText,
      })
      .returning();
    const [skill] = await tx
      .insert(skills)
      .values({
        pageId: page.id,
        creatorId: userId,
        ...createSkillMetadata(),
      })
      .returning();
    return { page, skill };
  });
}

export async function loadOwnedPageSkill(userId: string, pageId: string) {
  await assertOwnedPage(userId, pageId);
  const [skill] = await db
    .select()
    .from(skills)
    .where(eq(skills.pageId, pageId))
    .limit(1);
  return skill ?? null;
}

export async function loadWorkspaceSkills(userId: string) {
  const result = await db
    .select({ skill: skills })
    .from(skills)
    .innerJoin(pages, eq(skills.pageId, pages.id))
    .innerJoin(workspaces, eq(pages.workspaceId, workspaces.id))
    .where(and(eq(workspaces.userId, userId), isNull(pages.deletedAt)));
  return result.map(({ skill }) => skill);
}

export async function updateSkillMetadata(
  userId: string,
  pageId: string,
  metadata: Partial<SkillMetadata>
) {
  await assertOwnedPage(userId, pageId);
  const [updated] = await db
    .update(skills)
    .set({ ...metadata, updatedAt: new Date() })
    .where(eq(skills.pageId, pageId))
    .returning();
  if (!updated) {
    throw new ApiError(404, "Trang này chưa là Skill.", "SKILL_NOT_FOUND");
  }
  return updated;
}

export async function unmarkPageAsSkill(userId: string, pageId: string) {
  await assertOwnedPage(userId, pageId);
  const [removed] = await db
    .delete(skills)
    .where(eq(skills.pageId, pageId))
    .returning({ id: skills.id });
  return { unmarked: Boolean(removed) };
}
