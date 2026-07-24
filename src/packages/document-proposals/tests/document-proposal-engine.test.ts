import { describe, expect, it, beforeEach } from "vitest";
import {
  DocumentProposalEngine,
  createDocumentProposalEngine,
  InMemoryProposalStore,
  ProposalInvalidStateError,
  ProposalConflictError,
  type PageDocumentProposal,
} from "../index";
import type { DocumentContent } from "@/packages/document-editor";

describe("DocumentProposalEngine Deep Module", () => {
  let store: InMemoryProposalStore;
  let engine: DocumentProposalEngine;

  const sampleDocument: DocumentContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: { blockId: "b1" },
        content: [{ type: "text", text: "Original Text" }],
      },
    ],
  };

  const sampleProposal: PageDocumentProposal = {
    id: "prop-101",
    pageId: "page-1",
    sourceRunId: "run-1",
    creatorId: "user-1",
    baseContentRevision: 1,
    action: "edit",
    sourceKind: "block",
    agentId: null,
    agentPrompt: null,
    agentRunId: null,
    providerToolCallId: null,
    toolCallIdempotencyKey: null,
    idempotencyScopeId: null,
    status: "pending",
    summaryVi: "Thay đổi văn bản",
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

  beforeEach(() => {
    store = new InMemoryProposalStore();
    engine = createDocumentProposalEngine({ store });
  });

  describe("acceptProposal", () => {
    it("atomically transitions proposal state, applies diff, writes audit log, and persists updates", () => {
      store.saveProposal(sampleProposal);

      const result = engine.acceptProposal({
        proposalId: sampleProposal.id,
        document: sampleDocument,
        currentRevision: 1,
      });

      expect(result.applied).toBe(true);
      expect(result.newRevision).toBe(2);
      expect(result.proposal.status).toBe("accepted");
      expect(result.document.content?.[0].content?.[0].text).toBe(
        "Updated Text"
      );

      // Verify persistence in store
      const persisted = store.getProposalById(sampleProposal.id);
      expect(persisted?.status).toBe("accepted");

      // Verify audit log entry was written
      const auditEntries = engine.getAuditHistory("page-1");
      expect(auditEntries).toHaveLength(1);
      expect(auditEntries[0].action).toBe("accept");
      expect(auditEntries[0].proposalId).toBe(sampleProposal.id);
    });

    it("throws ProposalConflictError on document revision mismatch", () => {
      store.saveProposal(sampleProposal);

      expect(() =>
        engine.acceptProposal({
          proposalId: sampleProposal.id,
          document: sampleDocument,
          currentRevision: 2, // Mismatch (sampleProposal expects 1)
        })
      ).toThrow(ProposalConflictError);

      // Status remains pending
      const persisted = store.getProposalById(sampleProposal.id);
      expect(persisted?.status).toBe("pending");
    });

    it("throws ProposalInvalidStateError when accepting already decided proposal", () => {
      const acceptedProposal: PageDocumentProposal = {
        ...sampleProposal,
        status: "accepted",
      };
      store.saveProposal(acceptedProposal);

      expect(() =>
        engine.acceptProposal({
          proposalId: acceptedProposal.id,
          document: sampleDocument,
          currentRevision: 1,
        })
      ).toThrow(ProposalInvalidStateError);
    });
  });

  describe("rejectProposal", () => {
    it("atomically transitions proposal to rejected and writes audit log", () => {
      store.saveProposal(sampleProposal);

      const rejected = engine.rejectProposal({ proposalId: sampleProposal.id });

      expect(rejected.status).toBe("rejected");
      expect(store.getProposalById(sampleProposal.id)?.status).toBe("rejected");

      const auditEntries = engine.getAuditHistory("page-1");
      expect(auditEntries).toHaveLength(1);
      expect(auditEntries[0].action).toBe("reject");
    });
  });

  describe("isStale", () => {
    it("correctly identifies stale proposals", () => {
      expect(engine.isStale(null, 1)).toBe(false);
      expect(engine.isStale(sampleProposal, 1)).toBe(false);
      expect(engine.isStale(sampleProposal, 2)).toBe(true);
    });
  });
});
