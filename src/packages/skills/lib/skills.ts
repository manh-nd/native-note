import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { pages, skills, skillVersions, workspaces } from "@/db/schema";
import { ApiError } from "@/lib/api";
import { createEmptyStoredDocument } from "@/packages/documents";
import {
  compileSkillDraft,
  SkillCompilationError,
  type CompiledSkillDraft,
} from "./skill-compiler";
import { createSkillMetadata, type SkillMetadata } from "./skill-metadata";

export type ManagedSkill = typeof skills.$inferSelect;
export type PublishedSkillVersion = typeof skillVersions.$inferSelect;
// Ticket 16 introduces the Tool registry; no Tool is accessible before then.
const accessibleSkillTools = new Set<string>();

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
  return db.transaction(async (tx) => {
    const [skill] = await tx
      .select()
      .from(skills)
      .where(eq(skills.pageId, pageId))
      .for("update")
      .limit(1);
    if (!skill) return { unmarked: false };
    const [version] = await tx
      .select({ id: skillVersions.id })
      .from(skillVersions)
      .where(eq(skillVersions.skillId, skill.id))
      .limit(1);
    if (version)
      throw new ApiError(
        409,
        "Không thể bỏ đánh dấu Skill đã xuất bản vì sẽ làm mất lịch sử phiên bản.",
        "SKILL_VERSION_HISTORY_EXISTS"
      );
    await tx.delete(skills).where(eq(skills.id, skill.id));
    return { unmarked: true };
  });
}

function metadataFor(skill: ManagedSkill): SkillMetadata {
  return {
    inputScope: skill.inputScope,
    outputMode: skill.outputMode,
    status: skill.status,
    allowedTools: skill.allowedTools,
    approvalPolicy: skill.approvalPolicy,
    showInEditorMenu: skill.showInEditorMenu,
  };
}

function compilePublishedSkill(
  content: typeof pages.$inferSelect.content,
  skill: ManagedSkill
): CompiledSkillDraft {
  try {
    return compileSkillDraft({ content, metadata: metadataFor(skill) });
  } catch (error) {
    if (error instanceof SkillCompilationError)
      throw new ApiError(422, error.message, "SKILL_COMPILATION_FAILED");
    throw error;
  }
}

function assertAccessibleTools(compiled: CompiledSkillDraft) {
  const inaccessible = compiled.policy.allowedTools.filter(
    (tool) => !accessibleSkillTools.has(tool)
  );
  if (inaccessible.length)
    throw new ApiError(
      422,
      `Không thể truy cập công cụ: ${inaccessible.join(", ")}.`,
      "SKILL_TOOL_INACCESSIBLE"
    );
}

function matchesCompiledDraft(
  version: PublishedSkillVersion,
  compiled: CompiledSkillDraft
) {
  const policy = version.policy;
  return (
    version.instructionSnapshot === compiled.instructionSnapshot &&
    version.compilerVersion === compiled.compilerVersion &&
    policy.inputScope === compiled.policy.inputScope &&
    policy.outputMode === compiled.policy.outputMode &&
    policy.status === compiled.policy.status &&
    policy.approvalPolicy === compiled.policy.approvalPolicy &&
    policy.showInEditorMenu === compiled.policy.showInEditorMenu &&
    policy.allowedTools.length === compiled.policy.allowedTools.length &&
    policy.allowedTools.every(
      (tool, index) => tool === compiled.policy.allowedTools[index]
    )
  );
}

export async function publishSkillVersion(userId: string, pageId: string) {
  await assertOwnedPage(userId, pageId);
  return db.transaction(async (tx) => {
    const [owned] = await tx
      .select({ skill: skills, page: pages })
      .from(skills)
      .innerJoin(pages, eq(skills.pageId, pages.id))
      .where(and(eq(skills.pageId, pageId), isNull(pages.deletedAt)))
      .for("update", { of: [skills, pages] })
      .limit(1);
    if (!owned)
      throw new ApiError(404, "Trang này chưa là Skill.", "SKILL_NOT_FOUND");

    const compiled = compilePublishedSkill(owned.page.content, owned.skill);
    assertAccessibleTools(compiled);
    const versions = await tx
      .select()
      .from(skillVersions)
      .where(eq(skillVersions.skillId, owned.skill.id))
      .orderBy(desc(skillVersions.version));
    const existing = versions.find((version) =>
      matchesCompiledDraft(version, compiled)
    );
    const now = new Date();

    if (existing) {
      if (owned.skill.activeVersionId === existing.id)
        return { skill: owned.skill, version: existing, published: false };
      const [skill] = await tx
        .update(skills)
        .set({ activeVersionId: existing.id, updatedAt: now })
        .where(eq(skills.id, owned.skill.id))
        .returning();
      return { skill, version: existing, published: false };
    }

    const versionNumber = (versions[0]?.version ?? 0) + 1;
    const [version] = await tx
      .insert(skillVersions)
      .values({
        skillId: owned.skill.id,
        version: versionNumber,
        instructionSnapshot: compiled.instructionSnapshot,
        policy: compiled.policy,
        compilerVersion: compiled.compilerVersion,
        sourceContentRevision: owned.page.contentRevision,
        publishedBy: userId,
        publishedAt: now,
      })
      .returning();
    const [skill] = await tx
      .update(skills)
      .set({ activeVersionId: version.id, updatedAt: now })
      .where(eq(skills.id, owned.skill.id))
      .returning();
    return { skill, version, published: true };
  });
}

export async function loadSkillVersionHistory(userId: string, pageId: string) {
  await assertOwnedPage(userId, pageId);
  const [skill] = await db
    .select()
    .from(skills)
    .where(eq(skills.pageId, pageId))
    .limit(1);
  if (!skill)
    throw new ApiError(404, "Trang này chưa là Skill.", "SKILL_NOT_FOUND");
  const versions = await db
    .select()
    .from(skillVersions)
    .where(eq(skillVersions.skillId, skill.id))
    .orderBy(desc(skillVersions.version));
  return { skill, versions };
}

export async function activateSkillVersion(
  userId: string,
  pageId: string,
  versionId: string
) {
  await assertOwnedPage(userId, pageId);
  return db.transaction(async (tx) => {
    const [skill] = await tx
      .select()
      .from(skills)
      .where(eq(skills.pageId, pageId))
      .for("update")
      .limit(1);
    if (!skill)
      throw new ApiError(404, "Trang này chưa là Skill.", "SKILL_NOT_FOUND");
    const [version] = await tx
      .select()
      .from(skillVersions)
      .where(
        and(
          eq(skillVersions.id, versionId),
          eq(skillVersions.skillId, skill.id)
        )
      )
      .limit(1);
    if (!version)
      throw new ApiError(
        404,
        "Không tìm thấy phiên bản Skill.",
        "SKILL_VERSION_NOT_FOUND"
      );
    if (skill.activeVersionId === version.id)
      return { skill, version, activated: false };
    const [updated] = await tx
      .update(skills)
      .set({ activeVersionId: version.id, updatedAt: new Date() })
      .where(eq(skills.id, skill.id))
      .returning();
    return { skill: updated, version, activated: true };
  });
}

export async function loadActiveSkillVersion(userId: string, pageId: string) {
  const { skill } = await loadSkillVersionHistory(userId, pageId);
  if (!skill.activeVersionId)
    throw new ApiError(
      409,
      "Skill chưa có phiên bản đã xuất bản.",
      "SKILL_UNPUBLISHED"
    );
  const [version] = await db
    .select()
    .from(skillVersions)
    .where(
      and(
        eq(skillVersions.id, skill.activeVersionId),
        eq(skillVersions.skillId, skill.id)
      )
    )
    .limit(1);
  if (!version)
    throw new ApiError(
      409,
      "Phiên bản Skill đang hoạt động không hợp lệ.",
      "SKILL_VERSION_INVALID"
    );
  if (version.policy.status === "disabled")
    throw new ApiError(409, "Skill đang bị tắt.", "SKILL_DISABLED");
  return { skill, version };
}
