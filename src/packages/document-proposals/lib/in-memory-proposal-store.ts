import type { PageDocumentProposal } from "./document-proposals";
import {
  ProposalDecisionEngine,
  ProposalInvalidStateError,
  type ProposalAction,
} from "./proposal-decision-engine";
import {
  ReviewFindingAuditLog,
  type AuditLogEntry,
} from "./review-finding-audit-log";

export class InMemoryProposalStore {
  private proposals = new Map<string, PageDocumentProposal>();
  private auditLog = new ReviewFindingAuditLog();
  private decisionEngine = new ProposalDecisionEngine();

  saveProposal(proposal: PageDocumentProposal): void {
    this.proposals.set(proposal.id, { ...proposal });
  }

  getProposalById(proposalId: string): PageDocumentProposal | undefined {
    return this.proposals.get(proposalId);
  }

  getProposalsByPageId(pageId: string): PageDocumentProposal[] {
    return Array.from(this.proposals.values()).filter(
      (p) => p.pageId === pageId
    );
  }

  decideProposal({
    proposalId,
    action,
    userId,
    findingId,
  }: {
    proposalId: string;
    action: ProposalAction;
    userId: string;
    findingId?: string;
  }): PageDocumentProposal {
    const existing = this.proposals.get(proposalId);
    if (!existing) {
      throw new ProposalInvalidStateError(proposalId, "not_found", action);
    }

    const updated = this.decisionEngine.transitionState(existing, action);
    const decidedProposal: PageDocumentProposal = {
      ...updated,
      decidedAt: new Date(),
    };

    this.proposals.set(proposalId, decidedProposal);

    this.auditLog.recordDecision({
      proposalId,
      pageId: decidedProposal.pageId,
      findingId,
      action,
      userId,
      timestamp: decidedProposal.decidedAt ?? new Date(),
    });

    return decidedProposal;
  }

  getAuditHistory(pageId: string): readonly AuditLogEntry[] {
    return this.auditLog.getHistory(pageId);
  }
}
