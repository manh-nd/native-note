import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { pages, workspaces } from "@/db/schema";
import { ApiError, apiError, parseJson, requireUserId } from "@/lib/api";
import { ownedPage } from "@/lib/ownership";
import { createStoredDocument } from "@/packages/documents";

const mutationFields = {
  title: z.string().trim().min(1).max(120).optional(),
  content: z.unknown().optional(),
  parentId: z.string().uuid().nullable().optional(),
  position: z.number().int().min(0).optional(),
};

const contentUpdateSchema = z
  .object({
    title: z.never().optional(),
    content: z.unknown(),
    parentId: z.never().optional(),
    position: z.never().optional(),
    contentRevision: z.number().int().positive(),
    metadataRevision: z.never().optional(),
    version: z.never().optional(),
  })
  .strict()
  .refine((input) => input.content !== undefined);

const metadataUpdateSchema = z
  .object({
    ...mutationFields,
    content: z.never().optional(),
    metadataRevision: z.number().int().positive(),
    contentRevision: z.never().optional(),
    version: z.never().optional(),
  })
  .strict()
  .refine(
    (input) =>
      input.title !== undefined ||
      input.parentId !== undefined ||
      input.position !== undefined
  );

const legacyUpdateSchema = z
  .object({
    ...mutationFields,
    version: z.number().int().positive(),
    contentRevision: z.never().optional(),
    metadataRevision: z.never().optional(),
  })
  .strict();

const updateSchema = z.union([
  contentUpdateSchema,
  metadataUpdateSchema,
  legacyUpdateSchema,
]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const current = await ownedPage(userId, id);
    const input = await parseJson(request, updateSchema);
    const revisionStrategy =
      input.contentRevision !== undefined
        ? {
            condition: eq(pages.contentRevision, input.contentRevision),
            conflictCode: "CONTENT_REVISION_CONFLICT",
          }
        : input.metadataRevision !== undefined
          ? {
              condition: eq(pages.metadataRevision, input.metadataRevision),
              conflictCode: "METADATA_REVISION_CONFLICT",
            }
          : {
              condition: eq(pages.version, input.version!),
              conflictCode: "VERSION_CONFLICT",
            };
    const storedDocument =
      input.content === undefined
        ? undefined
        : createStoredDocument(input.content);
    if (input.parentId === id)
      throw new ApiError(400, "Một trang không thể là trang cha của chính nó.");
    if (input.parentId) {
      await ownedPage(userId, input.parentId);
      const tree = await db
        .select({ id: pages.id, parentId: pages.parentId })
        .from(pages)
        .where(eq(pages.workspaceId, current.workspaceId));
      let cursor: string | null = input.parentId;
      while (cursor) {
        if (cursor === id)
          throw new ApiError(
            400,
            "Không thể di chuyển trang vào một trang con của nó.",
            "PAGE_CYCLE"
          );
        cursor = tree.find((node) => node.id === cursor)?.parentId ?? null;
      }
    }
    const changesContent = storedDocument !== undefined;
    const changesMetadata =
      input.title !== undefined ||
      input.parentId !== undefined ||
      input.position !== undefined;
    const [updated] = await db
      .update(pages)
      .set({
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(storedDocument
          ? {
              content: storedDocument.content,
              documentSchemaVersion: storedDocument.schemaVersion,
              plainText: storedDocument.plainText,
            }
          : {}),
        ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
        ...(input.position !== undefined ? { position: input.position } : {}),
        ...(changesContent
          ? { contentRevision: sql`${pages.contentRevision} + 1` }
          : {}),
        ...(changesMetadata
          ? { metadataRevision: sql`${pages.metadataRevision} + 1` }
          : {}),
        version: sql`${pages.version} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(pages.id, current.id), revisionStrategy.condition))
      .returning();
    if (!updated) {
      throw new ApiError(
        409,
        "Trang đã được cập nhật ở nơi khác. Hãy tải lại trước khi lưu.",
        revisionStrategy.conflictCode
      );
    }
    return NextResponse.json({ page: updated });
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
    const { id } = await params;
    const deletedIds = await db.transaction(async (tx) => {
      const [target] = await tx
        .select({ id: pages.id, workspaceId: pages.workspaceId })
        .from(pages)
        .innerJoin(workspaces, eq(pages.workspaceId, workspaces.id))
        .where(and(eq(pages.id, id), eq(workspaces.userId, userId)))
        .for("update", { of: workspaces })
        .limit(1);
      if (!target)
        throw new ApiError(404, "Không tìm thấy trang.", "NOT_FOUND");

      const workspacePages = await tx
        .select({
          id: pages.id,
          parentId: pages.parentId,
          deletedAt: pages.deletedAt,
        })
        .from(pages)
        .where(eq(pages.workspaceId, target.workspaceId));
      const subtree = new Set([id]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const page of workspacePages) {
          if (
            page.parentId &&
            subtree.has(page.parentId) &&
            !subtree.has(page.id)
          ) {
            subtree.add(page.id);
            changed = true;
          }
        }
      }

      const activePages = workspacePages.filter((page) => !page.deletedAt);
      const activeDeletedIds = activePages
        .filter((page) => subtree.has(page.id))
        .map((page) => page.id);
      if (!activeDeletedIds.length) return [...subtree];
      if (activeDeletedIds.length >= activePages.length) {
        throw new ApiError(409, "Cần giữ lại ít nhất một trang.", "LAST_PAGE");
      }

      const now = new Date();
      await tx
        .update(pages)
        .set({ deletedAt: now, updatedAt: now })
        .where(
          and(
            eq(pages.workspaceId, target.workspaceId),
            isNull(pages.deletedAt),
            inArray(pages.id, activeDeletedIds)
          )
        );
      return [...subtree];
    });
    return NextResponse.json({ deletedIds });
  } catch (error) {
    return apiError(error);
  }
}
