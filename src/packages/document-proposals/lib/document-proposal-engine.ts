import type { DocumentContent } from "@/packages/document-editor";
import type { PageDocumentProposal } from "./document-proposals";
import { InMemoryProposalStore } from "./in-memory-proposal-store";
import { ProposalDecisionEngine } from "./proposal-decision-engine";
import {
  ProposalDiffApplier,
  type ApplyDiffResult,
} from "./proposal-diff-applier";
import {
  ReviewFindingAuditLog,
  type AuditLogEntry,
} from "./review-finding-audit-log";
import { isDocumentProposalStale } from "../lifecycle";

export type DocumentProposalEngineOptions = {
  store?: InMemoryProposalStore;
  auditLog?: ReviewFindingAuditLog;
  decisionEngine?: ProposalDecisionEngine;
  diffApplier?: ProposalDiffApplier;
};

export class DocumentProposalEngine {
  private store?: InMemoryProposalStore;
  private auditLog: ReviewFindingAuditLog;
  private decisionEngine: ProposalDecisionEngine;
  private diffApplier: ProposalDiffApplier;

  constructor(options: DocumentProposalEngineOptions = {}) {
    this.store = options.store;
    this.auditLog = options.auditLog ?? new ReviewFindingAuditLog();
    this.decisionEngine =
      options.decisionEngine ?? new ProposalDecisionEngine();
    this.diffApplier = options.diffApplier ?? new ProposalDiffApplier();
  }

  acceptProposal({
    proposalId,
    document,
    currentRevision,
    userId = "user-1",
  }: {
    proposalId: string;
    document: DocumentContent;
    currentRevision: number;
    userId?: string;
  }): ApplyDiffResult & { proposal: PageDocumentProposal } {
    const proposal = this.store?.getProposalById(proposalId);
    if (!proposal) {
      throw new Error(`Đề xuất "${proposalId}" không tồn tại.`);
    }

    // 1. Validate decision state transition (throws ProposalInvalidStateError if not pending)
    const nextProposal = this.decisionEngine.transitionState(
      proposal,
      "accept"
    );

    // 2. Apply diff operations (throws ProposalConflictError if revision mismatch)
    const diffResult = this.diffApplier.applyDiff({
      document,
      currentRevision,
      proposal,
    });

    // 3. Atomically persist updated proposal to store
    if (this.store) {
      this.store.saveProposal(nextProposal);
    }

    // 4. Record audit log entry
    this.auditLog.recordDecision({
      findingId: proposal.id,
      proposalId: proposal.id,
      pageId: proposal.pageId,
      action: "accept",
      userId,
      timestamp: new Date(),
    });

    return {
      ...diffResult,
      proposal: nextProposal,
    };
  }

  rejectProposal({
    proposalId,
    userId = "user-1",
  }: {
    proposalId: string;
    userId?: string;
  }): PageDocumentProposal {
    const proposal = this.store?.getProposalById(proposalId);
    if (!proposal) {
      throw new Error(`Đề xuất "${proposalId}" không tồn tại.`);
    }

    const nextProposal = this.decisionEngine.transitionState(
      proposal,
      "reject"
    );

    if (this.store) {
      this.store.saveProposal(nextProposal);
    }

    this.auditLog.recordDecision({
      findingId: proposal.id,
      proposalId: proposal.id,
      pageId: proposal.pageId,
      action: "reject",
      userId,
      timestamp: new Date(),
    });

    return nextProposal;
  }

  isStale(
    proposal: PageDocumentProposal | null | undefined,
    currentContentRevision: number
  ): boolean {
    if (!proposal) return false;
    return proposal.operations.baseContentRevision < currentContentRevision;
  }

  getAuditHistory(pageId: string): readonly AuditLogEntry[] {
    return this.auditLog.getHistory(pageId);
  }
}

export function createDocumentProposalEngine(
  options?: DocumentProposalEngineOptions
): DocumentProposalEngine {
  return new DocumentProposalEngine(options);
}
