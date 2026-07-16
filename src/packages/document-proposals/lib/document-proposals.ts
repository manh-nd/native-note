import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  aiRuns,
  documentProposals,
  findings,
  learningItems,
  pages,
  reviews,
  workspaces,
} from "@/db/schema";
import { ApiError } from "@/lib/api";
import {
  applyDocumentOperations,
  createDocumentTextIndex,
  createPortableExcerpt,
  type DocumentContent,
  type DocumentOperationBatch,
} from "@/packages/document-editor";
import { isDocumentProposalStale } from "../lifecycle";
import type { PersonalInstructionsSnapshot } from "@/packages/instructions";

export type SelectionProposalSegment = {
  blockId: string;
  blockFrom: number;
  blockTo: number;
  text: string;
  result: string;
};

type SelectionSkillVersion = {
  id: string;
  policy: {
    inputScope: string;
    outputMode: "proposal" | "read_only";
    [key: string]: unknown;
  };
};

export type BlockProposalBehavior = "replace" | "insert";

export function createBlockDocumentProposalOperations({
  content,
  contentRevision,
  blockId,
  expectedText,
  result,
  behavior,
}: {
  content: DocumentContent;
  contentRevision: number;
  blockId: string;
  expectedText: string;
  result: string;
  behavior: BlockProposalBehavior;
}): DocumentOperationBatch {
  const block = createPortableExcerpt(content).find(
    (excerpt) => excerpt.blockId === blockId
  );
  if (!block || block.text !== expectedText) {
    throw new ApiError(
      409,
      "Block has changed. Create the proposal again.",
      "STALE_BLOCK"
    );
  }
  const target = { blockId, expectedText };
  if (behavior === "replace") {
    return {
      baseContentRevision: contentRevision,
      operations: [
        {
          type: "replace-text",
          target: { ...target, from: 0, to: expectedText.length },
          text: result,
        },
      ],
    };
  }
  const blocks: DocumentContent[] = result
    .split(/\n{2,}/)
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text) => {
      if (block.type === "listItem" || block.type === "taskItem") {
        return {
          type: block.type,
          attrs: {
            blockId: crypto.randomUUID(),
            ...(block.type === "taskItem" &&
            typeof block.attributes.checked === "boolean"
              ? { checked: block.attributes.checked }
              : {}),
          },
          content: [
            {
              type: "paragraph",
              attrs: { blockId: crypto.randomUUID() },
              content: [{ type: "text", text }],
            },
          ],
        };
      }
      return {
        type: "paragraph",
        attrs: { blockId: crypto.randomUUID() },
        content: [{ type: "text", text }],
      };
    });
  if (!blocks.length) {
    throw new ApiError(
      502,
      "AI did not return content to insert.",
      "INVALID_AI_RESPONSE"
    );
  }
  return {
    baseContentRevision: contentRevision,
    operations: [{ type: "insert-blocks-after", target, blocks }],
  };
}

type Page = typeof pages.$inferSelect;
type Proposal = typeof documentProposals.$inferSelect;

export type PageDocumentProposal = Proposal & {
  action: string;
  sourceKind: "selection" | "block" | "review" | "skill";
};

export type ReviewFindingDraft = {
  blockId: string;
  category:
    | "grammar"
    | "word_choice"
    | "collocation"
    | "naturalness"
    | "register"
    | "clarity";
  original: string;
  suggestion: string;
  explanationVi: string;
  exampleEn: string;
  register: string;
  confidence: number;
  from: number;
  to: number;
};

function createReviewDocumentProposalOperations({
  content,
  contentRevision,
  findings: reviewFindings,
}: {
  content: unknown;
  contentRevision: number;
  findings: ReviewFindingDraft[];
}) {
  const textIndex = createDocumentTextIndex(content);
  const blocks = new Map(
    textIndex.blocks.map((block) => [block.blockId, block])
  );
  for (const finding of reviewFindings) {
    const block = blocks.get(finding.blockId);
    if (
      !block ||
      finding.from < 0 ||
      finding.to < finding.from ||
      block.text.slice(finding.from, finding.to) !== finding.original
    ) {
      throw new ApiError(
        502,
        "AI trả về vị trí góp ý không hợp lệ.",
        "INVALID_AI_RESPONSE"
      );
    }
  }
  const changedFindings = reviewFindings.filter(
    (finding) => finding.original !== finding.suggestion
  );
  const changedRangesByBlock = new Map<string, ReviewFindingDraft[]>();
  for (const finding of changedFindings) {
    const ranges = changedRangesByBlock.get(finding.blockId) ?? [];
    ranges.push(finding);
    changedRangesByBlock.set(finding.blockId, ranges);
  }
  for (const ranges of changedRangesByBlock.values()) {
    ranges.sort((left, right) => left.from - right.from);
    if (
      ranges.some(
        (finding, index) => index > 0 && finding.from < ranges[index - 1].to
      )
    ) {
      throw new ApiError(
        502,
        "AI trả về các góp ý chồng lấp.",
        "INVALID_AI_RESPONSE"
      );
    }
  }
  const expectedTextByBlock = new Map(
    textIndex.blocks.map((block) => [block.blockId, block.text])
  );
  const operations = changedFindings
    .slice()
    .sort((left, right) =>
      left.blockId === right.blockId ? right.from - left.from : 0
    )
    .map((finding) => {
      const expectedText = expectedTextByBlock.get(finding.blockId)!;
      const operation = {
        type: "replace-text" as const,
        target: {
          blockId: finding.blockId,
          expectedText,
          from: finding.from,
          to: finding.to,
        },
        text: finding.suggestion,
      };
      expectedTextByBlock.set(
        finding.blockId,
        `${expectedText.slice(0, finding.from)}${finding.suggestion}${expectedText.slice(finding.to)}`
      );
      return operation;
    });
  return {
    snapshot: textIndex.text,
    blocks,
    batch: { baseContentRevision: contentRevision, operations },
  };
}

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

type SelectionRunOptions = {
  page: Page;
  userId: string;
  sourceKind: "selection" | "skill";
  action: string;
  snapshot: string;
  model: string;
  summaryVi: string;
  segments: SelectionProposalSegment[];
  alwaysRecordRun?: boolean;
  createProposal?: boolean;
  audit?: {
    skillVersionId: string;
    policySnapshot: SelectionSkillVersion["policy"];
  };
  instructions?: PersonalInstructionsSnapshot | null;
  sourceRunId?: string;
};

function instructionsAudit(instructions?: PersonalInstructionsSnapshot | null) {
  return instructions
    ? {
        instructionsPageId: instructions.pageId,
        instructionsContentRevision: instructions.contentRevision,
        instructionsSnapshot: instructions.snapshot,
      }
    : {};
}

async function persistSelectionRun({
  page,
  userId,
  sourceKind,
  action,
  snapshot,
  model,
  summaryVi,
  segments,
  alwaysRecordRun = false,
  createProposal = true,
  audit,
  instructions,
  sourceRunId,
}: SelectionRunOptions) {
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
    if (!operations.operations.length && !alwaysRecordRun)
      return { run: null, proposal: null };
    const runValues: typeof aiRuns.$inferInsert = {
      pageId: currentPage.id,
      creatorId: userId,
      sourceKind,
      action,
      model,
      status: "completed",
      inputSnapshot: snapshot,
      outputSnapshot: { summaryVi, segments },
      ...instructionsAudit(instructions),
      ...(audit && {
        contentRevision: currentPage.contentRevision,
        skillVersionId: audit.skillVersionId,
        policySnapshot: audit.policySnapshot,
      }),
    };
    const [run] = sourceRunId
      ? await tx
          .update(aiRuns)
          .set(runValues)
          .where(eq(aiRuns.id, sourceRunId))
          .returning()
      : await tx.insert(aiRuns).values(runValues).returning();
    if (!createProposal || !operations.operations.length)
      return { run, proposal: null };
    const [proposal] = await tx
      .insert(documentProposals)
      .values({
        pageId: currentPage.id,
        sourceRunId: run.id,
        creatorId: userId,
        baseContentRevision: currentPage.contentRevision,
        operations,
        summaryVi,
      })
      .returning();
    return { run, proposal };
  });
}

export async function createSelectionDocumentProposal({
  page,
  userId,
  action,
  snapshot,
  model,
  summaryVi,
  segments,
  instructions,
  sourceRunId,
}: {
  page: Page;
  userId: string;
  action: string;
  snapshot: string;
  model: string;
  summaryVi: string;
  segments: SelectionProposalSegment[];
  instructions?: PersonalInstructionsSnapshot | null;
  sourceRunId?: string;
}) {
  const stored = await persistSelectionRun({
    page,
    userId,
    sourceKind: "selection",
    action,
    snapshot,
    model,
    summaryVi,
    segments,
    instructions,
    alwaysRecordRun: true,
    sourceRunId,
  });
  return stored.proposal;
}

export async function createSkillSelectionRun({
  page,
  userId,
  skillVersion,
  snapshot,
  model,
  summaryVi,
  segments,
}: {
  page: Page;
  userId: string;
  skillVersion: SelectionSkillVersion;
  snapshot: string;
  model: string;
  summaryVi: string;
  segments: SelectionProposalSegment[];
}) {
  return persistSelectionRun({
    page,
    userId,
    sourceKind: "skill",
    action: `skill:${skillVersion.id}`,
    snapshot,
    model,
    summaryVi,
    segments,
    alwaysRecordRun: true,
    createProposal: skillVersion.policy.outputMode === "proposal",
    audit: {
      skillVersionId: skillVersion.id,
      policySnapshot: skillVersion.policy,
    },
  });
}

export async function createBlockDocumentProposal({
  page,
  userId,
  action,
  behavior,
  expectedText,
  blockId,
  result,
  summaryVi,
  alternatives,
  model,
  instructions,
  sourceRunId,
}: {
  page: Page;
  userId: string;
  action: string;
  behavior: BlockProposalBehavior;
  expectedText: string;
  blockId: string;
  result: string;
  summaryVi: string;
  alternatives: string[];
  model: string;
  instructions?: PersonalInstructionsSnapshot | null;
  sourceRunId?: string;
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
        "Nội dung đã thay đổi. Hãy tạo lại đề xuất.",
        "STALE_BLOCK"
      );
    }
    const operations = createBlockDocumentProposalOperations({
      content: currentPage.content,
      contentRevision: currentPage.contentRevision,
      blockId,
      expectedText,
      result,
      behavior,
    });
    const runValues: typeof aiRuns.$inferInsert = {
      pageId: currentPage.id,
      creatorId: userId,
      sourceKind: "block",
      action,
      model,
      status: "completed",
      inputSnapshot: expectedText,
      outputSnapshot: { behavior, result, summaryVi, alternatives },
      ...instructionsAudit(instructions),
    };
    const [run] = sourceRunId
      ? await tx
          .update(aiRuns)
          .set(runValues)
          .where(eq(aiRuns.id, sourceRunId))
          .returning()
      : await tx.insert(aiRuns).values(runValues).returning();
    const [proposal] = await tx
      .insert(documentProposals)
      .values({
        pageId: currentPage.id,
        sourceRunId: run.id,
        creatorId: userId,
        baseContentRevision: currentPage.contentRevision,
        operations,
        summaryVi,
      })
      .returning();
    return proposal;
  });
}

export async function recordReadOnlyAiAction({
  page,
  userId,
  sourceKind,
  action,
  model,
  inputSnapshot,
  outputSnapshot,
  instructions,
  status = "completed",
}: {
  page: Page;
  userId: string;
  sourceKind: "selection" | "block";
  action: string;
  model: string;
  inputSnapshot: string;
  outputSnapshot: unknown;
  instructions?: PersonalInstructionsSnapshot | null;
  status?: "completed" | "failed";
}) {
  const [run] = await db
    .insert(aiRuns)
    .values({
      pageId: page.id,
      creatorId: userId,
      sourceKind,
      action,
      model,
      status,
      inputSnapshot,
      outputSnapshot,
      contentRevision: page.contentRevision,
      ...instructionsAudit(instructions),
    })
    .returning();
  return run;
}

export async function startAiActionRun({
  page,
  userId,
  sourceKind,
  action,
  model,
  inputSnapshot,
  instructions,
}: {
  page: Page;
  userId: string;
  sourceKind: "selection" | "block";
  action: string;
  model: string;
  inputSnapshot: string;
  instructions?: PersonalInstructionsSnapshot | null;
}) {
  return recordReadOnlyAiAction({
    page,
    userId,
    sourceKind,
    action,
    model,
    inputSnapshot,
    outputSnapshot: { errorCode: "AI_RUN_INCOMPLETE" },
    instructions,
    status: "failed",
  });
}

export async function completeAiActionRun(
  runId: string,
  outputSnapshot: unknown
) {
  const [run] = await db
    .update(aiRuns)
    .set({ status: "completed", outputSnapshot, completedAt: new Date() })
    .where(eq(aiRuns.id, runId))
    .returning();
  return run;
}

export async function createReviewDocumentProposals({
  page,
  userId,
  model,
  snapshot,
  findings: reviewFindings,
  instructions,
}: {
  page: Page;
  userId: string;
  model: string;
  snapshot: string;
  findings: ReviewFindingDraft[];
  instructions?: PersonalInstructionsSnapshot | null;
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
        "Nội dung đã thay đổi. Hãy chạy lại review.",
        "STALE_REVIEW"
      );
    }
    const reviewProposal = createReviewDocumentProposalOperations({
      content: currentPage.content,
      contentRevision: currentPage.contentRevision,
      findings: reviewFindings,
    });
    if (reviewProposal.snapshot !== snapshot) {
      throw new ApiError(
        409,
        "Nội dung đã thay đổi. Hãy chạy lại review.",
        "STALE_REVIEW"
      );
    }
    const [run] = await tx
      .insert(aiRuns)
      .values({
        pageId: currentPage.id,
        creatorId: userId,
        sourceKind: "review",
        action: "review",
        model,
        status: "completed",
        inputSnapshot: snapshot,
        outputSnapshot: { findings: reviewFindings },
        ...instructionsAudit(instructions),
      })
      .returning();
    const [review] = await tx
      .insert(reviews)
      .values({
        pageId: currentPage.id,
        sourceRunId: run.id,
        contentRevision: currentPage.contentRevision,
        scopeFrom: 0,
        scopeTo: snapshot.length,
        snapshot,
        model,
      })
      .returning();

    const [proposal] = reviewProposal.batch.operations.length
      ? await tx
          .insert(documentProposals)
          .values({
            pageId: currentPage.id,
            sourceRunId: run.id,
            creatorId: userId,
            baseContentRevision: currentPage.contentRevision,
            operations: reviewProposal.batch,
            summaryVi: reviewFindings.find(
              (finding) => finding.original !== finding.suggestion
            )!.explanationVi,
          })
          .returning()
      : [];
    const storedFindings = [];
    for (const finding of reviewFindings) {
      const block = reviewProposal.blocks.get(finding.blockId)!;
      const [stored] = await tx
        .insert(findings)
        .values({
          reviewId: review.id,
          proposalId:
            finding.original === finding.suggestion ? undefined : proposal?.id,
          category: finding.category,
          original: finding.original,
          suggestion: finding.suggestion,
          explanationVi: finding.explanationVi,
          exampleEn: finding.exampleEn,
          register: finding.register,
          confidence: finding.confidence,
          from: block.from + finding.from,
          to: block.from + finding.to,
        })
        .returning();
      storedFindings.push(stored);
    }
    return storedFindings;
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
  await tx
    .update(findings)
    .set({ status: "stale" })
    .where(
      and(eq(findings.proposalId, proposalId), eq(findings.status, "pending"))
    );
  return stale;
}

async function rejectPendingProposal(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  proposalId: string
) {
  return tx
    .update(documentProposals)
    .set({ status: "rejected", decidedAt: new Date() })
    .where(
      and(
        eq(documentProposals.id, proposalId),
        eq(documentProposals.status, "pending")
      )
    )
    .returning();
}

async function rejectProposalAndDismissLinkedFindings(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  proposal: Proposal | null
) {
  if (proposal?.status !== "pending") return [];
  await rejectPendingProposal(tx, proposal.id);
  return (await rejectLinkedFindings(tx, proposal.id)).map((item) => item.id);
}

async function acceptLinkedFindings(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string,
  proposalId: string
) {
  const linked = await tx
    .select({ finding: findings, review: reviews })
    .from(findings)
    .innerJoin(reviews, eq(findings.reviewId, reviews.id))
    .where(eq(findings.proposalId, proposalId))
    .for("update", { of: [findings] });
  if (!linked.length) return [];
  if (linked.some(({ finding }) => finding.status !== "pending")) {
    throw new ApiError(409, "Góp ý không còn chờ xử lý.", "FINDING_DECIDED");
  }
  const ids = linked.map(({ finding }) => finding.id);
  const accepted = await tx
    .update(findings)
    .set({ status: "applied" })
    .where(and(inArray(findings.id, ids), eq(findings.status, "pending")))
    .returning();
  if (accepted.length !== ids.length) {
    throw new ApiError(
      409,
      "Góp ý vừa được xử lý ở nơi khác.",
      "FINDING_DECIDED"
    );
  }
  const reviewByFinding = new Map(
    linked.map(({ finding, review }) => [finding.id, review])
  );
  await tx
    .insert(learningItems)
    .values(
      accepted.map((finding) => ({
        userId,
        findingId: finding.id,
        category: finding.category,
        originalPattern: finding.original,
        targetExpression: finding.suggestion,
        explanationVi: finding.explanationVi,
        sourceContext: reviewByFinding.get(finding.id)!.snapshot.slice(0, 1500),
      }))
    )
    .onConflictDoNothing({ target: learningItems.findingId });
  return accepted;
}

async function rejectLinkedFindings(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  proposalId: string
) {
  return tx
    .update(findings)
    .set({ status: "dismissed" })
    .where(
      and(eq(findings.proposalId, proposalId), eq(findings.status, "pending"))
    )
    .returning({ id: findings.id });
}

async function ownedFinding(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string,
  findingId: string
) {
  const [row] = await tx
    .select({ finding: findings, proposal: documentProposals, review: reviews })
    .from(findings)
    .innerJoin(reviews, eq(findings.reviewId, reviews.id))
    .innerJoin(pages, eq(reviews.pageId, pages.id))
    .innerJoin(workspaces, eq(pages.workspaceId, workspaces.id))
    .leftJoin(documentProposals, eq(findings.proposalId, documentProposals.id))
    .where(and(eq(findings.id, findingId), eq(workspaces.userId, userId)))
    .for("update", { of: [findings, documentProposals] })
    .limit(1);
  if (!row) throw new ApiError(404, "Không tìm thấy góp ý.", "NOT_FOUND");
  return row;
}

export async function loadPageDocumentProposals(
  userId: string,
  pageId: string
) {
  return db.transaction(async (tx) => {
    const page = await ownedPageForProposalLoad(tx, userId, pageId);
    const rows = await tx
      .select({
        proposal: documentProposals,
        action: aiRuns.action,
        sourceKind: aiRuns.sourceKind,
      })
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
        )
        .returning();
    }
    return {
      page,
      proposals: rows.map(({ proposal, action, sourceKind }) => ({
        ...proposal,
        status: staleIds.includes(proposal.id) ? "stale" : proposal.status,
        action,
        sourceKind,
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
    const acceptedFindings = await acceptLinkedFindings(
      tx,
      userId,
      proposal.id
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
    return {
      page: updatedPage,
      proposal: accepted,
      findings: acceptedFindings,
      idempotent: false,
    };
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
    const [rejected] = await rejectPendingProposal(tx, proposal.id);
    if (!rejected)
      throw new ApiError(
        409,
        "Đề xuất vừa được xử lý ở nơi khác.",
        "PROPOSAL_DECIDED"
      );
    const dismissedFindings = await rejectLinkedFindings(tx, proposal.id);
    return {
      proposal: rejected,
      findings: dismissedFindings,
      idempotent: false,
    };
  });
}

export async function createLearningItemFromFinding(
  userId: string,
  findingId: string
) {
  return db.transaction(async (tx) => {
    const { finding, proposal, review } = await ownedFinding(
      tx,
      userId,
      findingId
    );
    if (finding.status === "saved")
      return { finding, proposal, idempotent: true };
    if (finding.status !== "pending") {
      throw new ApiError(409, "Góp ý này đã được xử lý.", "FINDING_DECIDED");
    }
    const [saved] = await tx
      .update(findings)
      .set({ status: "saved" })
      .where(and(eq(findings.id, finding.id), eq(findings.status, "pending")))
      .returning();
    if (!saved) {
      throw new ApiError(
        409,
        "Góp ý vừa được xử lý ở nơi khác.",
        "FINDING_DECIDED"
      );
    }
    await tx
      .insert(learningItems)
      .values({
        userId,
        findingId: saved.id,
        category: saved.category,
        originalPattern: saved.original,
        targetExpression: saved.suggestion,
        explanationVi: saved.explanationVi,
        sourceContext: review.snapshot.slice(0, 1500),
      })
      .onConflictDoNothing({ target: learningItems.findingId });
    const dismissedFindingIds = await rejectProposalAndDismissLinkedFindings(
      tx,
      proposal
    );
    return {
      finding: saved,
      proposal,
      findingIds: [saved.id, ...dismissedFindingIds],
      idempotent: false,
    };
  });
}

export async function dismissReviewFinding(userId: string, findingId: string) {
  return db.transaction(async (tx) => {
    const { finding, proposal } = await ownedFinding(tx, userId, findingId);
    if (finding.status === "dismissed") {
      return { finding, proposal, idempotent: true };
    }
    if (finding.status !== "pending") {
      throw new ApiError(409, "Góp ý này đã được xử lý.", "FINDING_DECIDED");
    }
    const [dismissed] = await tx
      .update(findings)
      .set({ status: "dismissed" })
      .where(and(eq(findings.id, finding.id), eq(findings.status, "pending")))
      .returning();
    if (!dismissed) {
      throw new ApiError(
        409,
        "Góp ý vừa được xử lý ở nơi khác.",
        "FINDING_DECIDED"
      );
    }
    const dismissedFindingIds = await rejectProposalAndDismissLinkedFindings(
      tx,
      proposal
    );
    return {
      finding: dismissed,
      proposal,
      findingIds: [dismissed.id, ...dismissedFindingIds],
      idempotent: false,
    };
  });
}
