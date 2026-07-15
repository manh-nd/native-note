export {
  acceptDocumentProposal,
  applyFinding,
  createBlockDocumentProposal,
  createBlockDocumentProposalOperations,
  createReviewDocumentProposals,
  createSelectionDocumentProposal,
  dismissFinding,
  loadPageDocumentProposals,
  rejectDocumentProposal,
  saveFinding,
  type PageDocumentProposal,
  type BlockProposalBehavior,
  type ReviewFindingDraft,
  type SelectionProposalSegment,
} from "./lib/document-proposals";
export {
  isDocumentProposalStale,
  type DocumentProposalSnapshot,
} from "./lifecycle";
