import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { findings, learningItems, pages, reviews, workspaces } from "@/db/schema";
import { ApiError, apiError, requireUserId } from "@/lib/api";
import { findingMatchesCurrentText } from "@/lib/learning";

export async function POST(
  _: Request,
  { params }: { params: Promise<{ reviewId: string; decision: string }> },
) {
  try {
    const userId = await requireUserId();
    const { reviewId, decision } = await params;
    if (decision !== "accept" && decision !== "dismiss") throw new ApiError(404, "Thao tác không tồn tại.");

    const rows = await db.select({ finding: findings, review: reviews, page: pages })
      .from(reviews)
      .innerJoin(pages, eq(reviews.pageId, pages.id))
      .innerJoin(workspaces, eq(pages.workspaceId, workspaces.id))
      .leftJoin(findings, eq(findings.reviewId, reviews.id))
      .where(and(eq(reviews.id, reviewId), eq(workspaces.userId, userId)));
    if (!rows.length) throw new ApiError(404, "Không tìm thấy lượt chỉnh sửa.");

    const review = rows[0].review;
    const page = rows[0].page;
    const reviewFindings = rows.flatMap((row) => row.finding ? [row.finding] : []);
    const targetStatus = decision === "accept" ? "applied" : "dismissed";
    if (reviewFindings.length && reviewFindings.every((finding) => finding.status === targetStatus)) {
      return NextResponse.json({ reviewId, decision, idempotent: true });
    }
    if (reviewFindings.some((finding) => finding.status !== "pending")) {
      throw new ApiError(409, "Một phần kết quả đã được xử lý. Hãy chạy lại yêu cầu.", "MIXED_DECISION");
    }

    const current = page.version === review.pageVersion && reviewFindings.every((finding) => (
      findingMatchesCurrentText(page.plainText, finding.original, finding.from, finding.to)
    ));
    if (!current) {
      await db.update(findings).set({ status: "stale" }).where(and(eq(findings.reviewId, reviewId), eq(findings.status, "pending")));
      throw new ApiError(409, "Nội dung đã thay đổi nên kết quả AI không còn áp dụng được.", "STALE_SELECTION");
    }

    await db.transaction(async (tx) => {
      for (const finding of reviewFindings) {
        const [updated] = await tx.update(findings)
          .set({ status: targetStatus })
          .where(and(eq(findings.id, finding.id), eq(findings.status, "pending")))
          .returning();
        if (!updated) throw new ApiError(409, "Kết quả vừa được xử lý ở một phiên khác.", "MIXED_DECISION");
        if (decision === "accept") {
          await tx.insert(learningItems).values({
            userId,
            findingId: updated.id,
            category: updated.category,
            originalPattern: updated.original,
            targetExpression: updated.suggestion,
            explanationVi: updated.explanationVi,
            sourceContext: review.snapshot.slice(0, 1500),
          }).onConflictDoNothing({ target: learningItems.findingId });
        }
      }
    });
    return NextResponse.json({ reviewId, decision, idempotent: false });
  } catch (error) {
    return apiError(error);
  }
}
