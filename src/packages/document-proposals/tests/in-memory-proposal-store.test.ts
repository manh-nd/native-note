import { describe, expect, it } from "vitest";
import { InMemoryProposalStore, ProposalInvalidStateError } from "../index";
import type { PageDocumentProposal } from "../index";

describe("Headless InMemory Proposal Store Seam & Package Assembly", () => {
  const proposal1: PageDocumentProposal = {
    id: "p1",
    pageId: "page-1",
    sourceRunId: "run-1",
    creatorId: "user-1",
    baseContentRevision: 1,
    action: "edit",
    sourceKind: "agent",
    agentId: "agent-1",
    agentPrompt: "Draft summary",
    agentRunId: null,
    providerToolCallId: null,
    toolCallIdempotencyKey: null,
    idempotencyScopeId: null,
    status: "pending",
    summaryVi: "Tóm tắt 1",
    operations: { baseContentRevision: 1, operations: [] },
    createdAt: new Date(),
    decidedAt: null,
  };

  it("stores and retrieves pending proposals by pageId", () => {
    const store = new InMemoryProposalStore();
    store.saveProposal(proposal1);

    const pageProposals = store.getProposalsByPageId("page-1");
    expect(pageProposals).toHaveLength(1);
    expect(pageProposals[0].id).toBe("p1");
  });

  it("decides a proposal, updates status, and records in audit log", () => {
    const store = new InMemoryProposalStore();
    store.saveProposal(proposal1);

    const updated = store.decideProposal({
      proposalId: "p1",
      action: "accept",
      userId: "user-1",
    });

    expect(updated.status).toBe("accepted");
    expect(updated.decidedAt).toBeDefined();

    const auditHistory = store.getAuditHistory("page-1");
    expect(auditHistory).toHaveLength(1);
    expect(auditHistory[0].action).toBe("accept");
  });

  it("throws ProposalInvalidStateError when deciding non-existent or settled proposal", () => {
    const store = new InMemoryProposalStore();
    expect(() =>
      store.decideProposal({
        proposalId: "unknown",
        action: "accept",
        userId: "user-1",
      })
    ).toThrow(ProposalInvalidStateError);
  });
});
