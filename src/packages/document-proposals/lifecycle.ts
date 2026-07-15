import {
  applyDocumentOperations,
  type DocumentOperationBatch,
} from "@/packages/document-editor";

export type DocumentProposalSnapshot = {
  baseContentRevision: number;
  operations: DocumentOperationBatch;
};

export function isDocumentProposalStale({
  content,
  contentRevision,
  proposal,
}: {
  content: unknown;
  contentRevision: number;
  proposal: DocumentProposalSnapshot;
}) {
  if (proposal.baseContentRevision !== contentRevision) return true;
  try {
    applyDocumentOperations({
      content,
      contentRevision,
      batch: proposal.operations,
    });
    return false;
  } catch {
    return true;
  }
}
