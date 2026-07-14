import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { findings, learningItems, pages, reviews, workspaces } from "@/db/schema";
import { ApiError, apiError, requireUserId } from "@/lib/api";
import { findingMatchesCurrentText } from "@/lib/learning";

export async function POST(_: Request, { params }: { params: Promise<{ id: string; action: string }> }) {
  try {
    const userId = await requireUserId();
    const { id, action } = await params;
    if (!(["apply", "dismiss", "save"] as const).includes(action as "apply")) throw new ApiError(404, "Thao tác không tồn tại.");
    const [row] = await db.select({ finding: findings, review: reviews, page: pages })
      .from(findings)
      .innerJoin(reviews, eq(findings.reviewId, reviews.id))
      .innerJoin(pages, eq(reviews.pageId, pages.id))
      .innerJoin(workspaces, eq(pages.workspaceId, workspaces.id))
      .where(and(eq(findings.id, id), eq(workspaces.userId, userId))).limit(1);
    if (!row) throw new ApiError(404, "Không tìm thấy góp ý.");
    if (row.finding.status !== "pending") throw new ApiError(409, "Góp ý này đã được xử lý.", "ALREADY_HANDLED");

    const isCurrent = row.page.version === row.review.pageVersion
      && findingMatchesCurrentText(row.page.plainText, row.finding.original, row.finding.from, row.finding.to);
    if (action === "apply" && !isCurrent) {
      await db.update(findings).set({ status: "stale" }).where(eq(findings.id, id));
      throw new ApiError(409, "Nội dung đã thay đổi nên không thể áp dụng góp ý cũ.", "STALE_FINDING");
    }

    const status = action === "apply" ? "applied" : action === "save" ? "saved" : "dismissed";
    const result = await db.transaction(async (tx) => {
      const [updated] = await tx.update(findings).set({ status }).where(eq(findings.id, id)).returning();
      if (action !== "dismiss") {
        await tx.insert(learningItems).values({
          userId,
          findingId: updated.id,
          category: updated.category,
          originalPattern: updated.original,
          targetExpression: updated.suggestion,
          explanationVi: updated.explanationVi,
          sourceContext: row.review.snapshot.slice(0, 1500),
        }).onConflictDoNothing({ target: learningItems.findingId });
      }
      return updated;
    });
    return NextResponse.json({ finding: result, suggestion: result.suggestion });
  } catch (error) { return apiError(error); }
}
