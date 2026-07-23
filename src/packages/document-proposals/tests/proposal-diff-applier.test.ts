import { describe, expect, it } from "vitest";
import type { DocumentContent } from "@/packages/document-editor";
import { ProposalConflictError, ProposalDiffApplier } from "../index";
import type { PageDocumentProposal } from "../index";

describe("Proposal Atomic Diff Applier & Rollback Error Handling", () => {
  const initialDoc: DocumentContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: { blockId: "b1" },
        content: [{ type: "text", text: "Original Text" }],
      },
    ],
  };

  const validProposal: PageDocumentProposal = {
    id: "prop-1",
    pageId: "page-1",
    sourceRunId: "run-1",
    creatorId: "user-1",
    baseContentRevision: 1,
    action: "edit",
    sourceKind: "agent",
    agentId: "agent-1",
    agentPrompt: "Improve text",
    agentRunId: null,
    providerToolCallId: null,
    toolCallIdempotencyKey: null,
    idempotencyScopeId: null,
    status: "pending",
    summaryVi: "Đề xuất cải thiện",
    operations: {
      baseContentRevision: 1,
      operations: [
        {
          type: "replace-text",
          target: {
            blockId: "b1",
            expectedText: "Original Text",
            from: 0,
            to: 13,
          },
          text: "Updated Text",
        },
      ],
    },
    createdAt: new Date(),
    decidedAt: null,
  };

  it("applies proposal diff atomically to matching document content", () => {
    const applier = new ProposalDiffApplier();
    const result = applier.applyDiff({
      document: initialDoc,
      currentRevision: 1,
      proposal: validProposal,
    });

    expect(result.applied).toBe(true);
    expect(result.newRevision).toBe(2);
    expect(result.document.content?.[0].content?.[0].text).toBe("Updated Text");
  });

  it("throws ProposalConflictError and rolls back when baseContentRevision mismatches", () => {
    const applier = new ProposalDiffApplier();
    const staleProposal: PageDocumentProposal = {
      ...validProposal,
      operations: {
        ...validProposal.operations,
        baseContentRevision: 1,
      },
    };

    expect(() =>
      applier.applyDiff({
        document: initialDoc,
        currentRevision: 2, // Document has advanced to rev 2
        proposal: staleProposal,
      })
    ).toThrow(ProposalConflictError);
  });
});
