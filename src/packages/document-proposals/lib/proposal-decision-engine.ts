import type { PageDocumentProposal } from "./document-proposals";

export class ProposalInvalidStateError extends Error {
  constructor(proposalId: string, currentStatus: string, action: string) {
    super(
      `Không thể thực hiện hành động \"${action}\" trên đề xuất \"${proposalId}\" vì trạng thái hiện tại là \"${currentStatus}\".`
    );
    this.name = "ProposalInvalidStateError";
  }
}

export type ProposalAction = "accept" | "reject";

export class ProposalDecisionEngine {
  transitionState(
    proposal: PageDocumentProposal,
    action: ProposalAction
  ): PageDocumentProposal {
    if (proposal.status !== "pending") {
      throw new ProposalInvalidStateError(proposal.id, proposal.status, action);
    }

    const nextStatus = action === "accept" ? "accepted" : "rejected";
    return {
      ...proposal,
      status: nextStatus,
    };
  }
}
