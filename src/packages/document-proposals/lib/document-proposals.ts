import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { aiRuns, documentProposals, pages, workspaces } from "@/db/schema";
import { ApiError } from "@/lib/api";
import {
  applyDocumentOperations,
  createPortableExcerpt,
  type DocumentOperationBatch,
} from "@/packages/document-editor";
import { isDocumentProposalStale } from "../lifecycle";

export type SelectionProposalSegment = {
  blockId: string;
  blockFrom: number;
  blockTo: number;
  text: string;
  result: string;
};

type Page = typeof pages.$inferSelect;
type Proposal = typeof documentProposals.$inferSelect;

export type PageDocumentProposal = Proposal & { action: string };

function selectionOperations(
  page: Page,
  segments: SelectionProposalSegment[]
): DocumentOperationBatch {
  const excerpts = new Map(
    createPortableExcerpt(page.content).map((excerpt) => [
      excerpt.blockId,
      excerpt,
    ])
  );
  return {
    baseContentRevision: page.contentRevision,
    operations: segments.flatMap((segment) => {
      if (segment.result === segment.text) return [];
      const block = excerpts.get(segment.blockId);
      if (
        !block ||
        segment.blockFrom < 0 ||
        segment.blockTo < segment.blockFrom ||
        block.text.slice(segment.blockFrom, segment.blockTo) !== segment.text
      ) {
        throw new ApiError(
          409,
          "Đoạn được chọn đã thay đổi. Hãy chọn lại và thử lần nữa.",
          "STALE_SELECTION"
        );
      }
      return [
        {
          type: "replace-text" as const,
          target: {
            blockId: segment.blockId,
            expectedText: block.text,
            from: segment.blockFrom,
            to: segment.blockTo,
          },
          text: segment.result,
        },
      ];
    }),
  };
}

export async function createSelectionDocumentProposal({
  page,
  userId,
  action,
  snapshot,
  model,
  summaryVi,
  segments,
}: {
  page: Page;
  userId: string;
  action: string;
  snapshot: string;
  model: string;
  summaryVi: string;
  segments: SelectionProposalSegment[];
}) {
  return db.transaction(async (tx) => {
    const [currentPage] = await tx
      .select()
      .from(pages)
      .where(eq(pages.id, page.id))
      .for("update")
      .limit(1);
    if (!currentPage || currentPage.contentRevision !== page.contentRevision) {
      throw new ApiError(
        409,
        "Nội dung đã thay đổi. Hãy chọn lại và thử lần nữa.",
        "STALE_SELECTION"
      );
    }
    const operations = selectionOperations(currentPage, segments);
    if (!operations.operations.length) return null;
    const [run] = await tx
      .insert(aiRuns)
      .values({
        pageId: page.id,
        creatorId: userId,
        sourceKind: "selection",
        action,
        model,
        status: "completed",
        inputSnapshot: snapshot,
        outputSnapshot: { summaryVi, segments },
      })
      .returning();
    const [proposal] = await tx
      .insert(documentProposals)
      .values({
        pageId: page.id,
        sourceRunId: run.id,
        creatorId: userId,
        baseContentRevision: page.contentRevision,
        operations,
        summaryVi,
      })
      .returning();
    return proposal;
  });
}

async function ownedProposal(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string,
  proposalId: string
) {
  const [row] = await tx
    .select({ proposal: documentProposals, page: pages })
    .from(documentProposals)
    .innerJoin(pages, eq(documentProposals.pageId, pages.id))
    .innerJoin(workspaces, eq(pages.workspaceId, workspaces.id))
    .where(
      and(eq(documentProposals.id, proposalId), eq(workspaces.userId, userId))
    )
    .for("update", { of: [documentProposals, pages] })
    .limit(1);
  if (!row) throw new ApiError(404, "Không tìm thấy đề xuất.", "NOT_FOUND");
  return row;
}

async function ownedPageForProposalLoad(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string,
  pageId: string
) {
  const [page] = await tx
    .select({ page: pages })
    .from(pages)
    .innerJoin(workspaces, eq(pages.workspaceId, workspaces.id))
    .where(and(eq(pages.id, pageId), eq(workspaces.userId, userId)))
    .for("update", { of: [pages] })
    .limit(1);
  if (!page) throw new ApiError(404, "Không tìm thấy trang.", "NOT_FOUND");
  return page.page;
}

async function markProposalStale(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  proposalId: string
) {
  const [stale] = await tx
    .update(documentProposals)
    .set({ status: "stale", decidedAt: new Date() })
    .where(
      and(
        eq(documentProposals.id, proposalId),
        eq(documentProposals.status, "pending")
      )
    )
    .returning();
  if (!stale)
    throw new ApiError(
      409,
      "Đề xuất vừa được xử lý ở nơi khác.",
      "PROPOSAL_DECIDED"
    );
  return stale;
}

export async function loadPageDocumentProposals(
  userId: string,
  pageId: string
) {
  return db.transaction(async (tx) => {
    const page = await ownedPageForProposalLoad(tx, userId, pageId);
    const rows = await tx
      .select({ proposal: documentProposals, action: aiRuns.action })
      .from(documentProposals)
      .innerJoin(aiRuns, eq(documentProposals.sourceRunId, aiRuns.id))
      .where(
        and(
          eq(documentProposals.pageId, pageId),
          inArray(documentProposals.status, ["pending", "stale"])
        )
      )
      .orderBy(desc(documentProposals.createdAt))
      .for("update", { of: [documentProposals] });
    const staleIds = rows
      .filter(
        ({ proposal }) =>
          proposal.status === "pending" &&
          isDocumentProposalStale({
            content: page.content,
            contentRevision: page.contentRevision,
            proposal,
          })
      )
      .map(({ proposal }) => proposal.id);
    if (staleIds.length) {
      await tx
        .update(documentProposals)
        .set({ status: "stale", decidedAt: new Date() })
        .where(
          and(
            inArray(documentProposals.id, staleIds),
            eq(documentProposals.status, "pending")
          )
        );
    }
    return {
      page,
      proposals: rows.map(({ proposal, action }) => ({
        ...proposal,
        status: staleIds.includes(proposal.id) ? "stale" : proposal.status,
        action,
      })),
    };
  });
}

export async function acceptDocumentProposal(
  userId: string,
  proposalId: string
) {
  const result = await db.transaction(async (tx) => {
    const { proposal, page } = await ownedProposal(tx, userId, proposalId);
    if (proposal.status === "accepted")
      return { page, proposal, idempotent: true };
    if (proposal.status !== "pending")
      throw new ApiError(
        409,
        "Đề xuất không còn chờ phê duyệt.",
        "PROPOSAL_DECIDED"
      );
    if (
      isDocumentProposalStale({
        content: page.content,
        contentRevision: page.contentRevision,
        proposal,
      })
    ) {
      const stale = await markProposalStale(tx, proposal.id);
      return { page, proposal: stale, idempotent: false, stale: true };
    }
    const applied = applyDocumentOperations({
      content: page.content,
      contentRevision: page.contentRevision,
      batch: proposal.operations,
    });
    const now = new Date();
    const [updatedPage] = await tx
      .update(pages)
      .set({
        content: applied.content,
        plainText: applied.plainText,
        contentRevision: sql`${pages.contentRevision} + 1`,
        version: sql`${pages.version} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(pages.id, page.id),
          eq(pages.contentRevision, page.contentRevision)
        )
      )
      .returning();
    if (!updatedPage)
      throw new ApiError(
        409,
        "Nội dung đã thay đổi.",
        "CONTENT_REVISION_CONFLICT"
      );
    const [accepted] = await tx
      .update(documentProposals)
      .set({ status: "accepted", decidedAt: now })
      .where(
        and(
          eq(documentProposals.id, proposal.id),
          eq(documentProposals.status, "pending")
        )
      )
      .returning();
    if (!accepted)
      throw new ApiError(
        409,
        "Đề xuất vừa được xử lý ở nơi khác.",
        "PROPOSAL_DECIDED"
      );
    return { page: updatedPage, proposal: accepted, idempotent: false };
  });
  if ("stale" in result && result.stale)
    throw new ApiError(
      409,
      "Nội dung đã thay đổi. Hãy tạo lại đề xuất.",
      "STALE_PROPOSAL"
    );
  return result;
}

export async function rejectDocumentProposal(
  userId: string,
  proposalId: string
) {
  return db.transaction(async (tx) => {
    const { proposal } = await ownedProposal(tx, userId, proposalId);
    if (proposal.status === "rejected") return { proposal, idempotent: true };
    if (proposal.status !== "pending")
      throw new ApiError(
        409,
        "Đề xuất không còn chờ phê duyệt.",
        "PROPOSAL_DECIDED"
      );
    const [rejected] = await tx
      .update(documentProposals)
      .set({ status: "rejected", decidedAt: new Date() })
      .where(
        and(
          eq(documentProposals.id, proposal.id),
          eq(documentProposals.status, "pending")
        )
      )
      .returning();
    if (!rejected)
      throw new ApiError(
        409,
        "Đề xuất vừa được xử lý ở nơi khác.",
        "PROPOSAL_DECIDED"
      );
    return { proposal: rejected, idempotent: false };
  });
}
