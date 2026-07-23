import {
  applyDocumentOperations,
  type DocumentContent,
} from "@/packages/document-editor";
import type { PageDocumentProposal } from "./document-proposals";

export class ProposalConflictError extends Error {
  constructor(proposalId: string, expectedRev: number, actualRev: number) {
    super(
      `Đề xuất \"${proposalId}\" bị xung đột phiên bản (dự kiến revision ${expectedRev}, phiên bản tài liệu hiện tại là ${actualRev}).`
    );
    this.name = "ProposalConflictError";
  }
}

export type ApplyDiffResult = {
  applied: boolean;
  newRevision: number;
  document: DocumentContent;
};

export class ProposalDiffApplier {
  applyDiff({
    document,
    currentRevision,
    proposal,
  }: {
    document: DocumentContent;
    currentRevision: number;
    proposal: PageDocumentProposal;
  }): ApplyDiffResult {
    const expectedRevision = proposal.operations.baseContentRevision;
    if (expectedRevision !== currentRevision) {
      throw new ProposalConflictError(
        proposal.id,
        expectedRevision,
        currentRevision
      );
    }

    try {
      const applied = applyDocumentOperations({
        content: document,
        contentRevision: currentRevision,
        batch: proposal.operations,
      });
      return {
        applied: true,
        newRevision: currentRevision + 1,
        document: applied.content,
      };
    } catch (error) {
      if (error instanceof ProposalConflictError) throw error;
      throw new ProposalConflictError(
        proposal.id,
        expectedRevision,
        currentRevision
      );
    }
  }
}
