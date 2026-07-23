import { describe, expect, it } from "vitest";
import { ProposalDecisionEngine, ProposalInvalidStateError } from "../index";
import type { PageDocumentProposal } from "../index";

describe("Proposal Decision State Machine & Validation Engine", () => {
  const pendingProposal: PageDocumentProposal = {
    id: "prop-1",
    pageId: "page-1",
    sourceRunId: "run-1",
    creatorId: "user-1",
    baseContentRevision: 1,
    action: "edit",
    sourceKind: "agent",
    agentId: "agent-1",
    agentPrompt: "Improve introductory section",
    agentRunId: null,
    providerToolCallId: null,
    toolCallIdempotencyKey: null,
    idempotencyScopeId: null,
    status: "pending",
    summaryVi: "Đề xuất cải thiện",
    operations: { baseContentRevision: 1, operations: [] },
    createdAt: new Date(),
    decidedAt: null,
  };

  it("transitions pending proposal to accepted state", () => {
    const engine = new ProposalDecisionEngine();
    const updated = engine.transitionState(pendingProposal, "accept");
    expect(updated.status).toBe("accepted");
  });

  it("transitions pending proposal to rejected state", () => {
    const engine = new ProposalDecisionEngine();
    const updated = engine.transitionState(pendingProposal, "reject");
    expect(updated.status).toBe("rejected");
  });

  it("throws ProposalInvalidStateError when trying to transition already accepted proposal", () => {
    const engine = new ProposalDecisionEngine();
    const accepted = engine.transitionState(pendingProposal, "accept");
    expect(() => engine.transitionState(accepted, "reject")).toThrow(
      ProposalInvalidStateError
    );
  });
});
