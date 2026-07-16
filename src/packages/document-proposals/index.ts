export {
  acceptDocumentProposal,
  createBlockDocumentProposal,
  createBlockDocumentProposalOperations,
  createLearningItemFromFinding,
  createReviewDocumentProposals,
  createSkillSelectionRun,
  createSelectionDocumentProposal,
  dismissReviewFinding,
  loadPageDocumentProposals,
  rejectDocumentProposal,
  type PageDocumentProposal,
  type BlockProposalBehavior,
  type ReviewFindingDraft,
  type SelectionProposalSegment,
} from "./lib/document-proposals";
export {
  isDocumentProposalStale,
  type DocumentProposalSnapshot,
} from "./lifecycle";
