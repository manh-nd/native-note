export {
  acceptDocumentProposal,
  applyReviewFindings,
  createAgentDocumentProposal,
  createBlockDocumentProposal,
  createBlockDocumentProposalOperations,
  createLearningItemFromFinding,
  createReviewDocumentProposals,
  createReviewFindingDecisionBatch,
  createSkillSelectionRun,
  createSelectionDocumentProposal,
  dismissReviewFinding,
  loadPageDocumentProposals,
  loadScheduledProposalInbox,
  rejectDocumentProposal,
  recordReadOnlyAiAction,
  startAiActionRun,
  completeAiActionRun,
  type PageDocumentProposal,
  type BlockProposalBehavior,
  type CreateAgentDocumentProposalInput,
  type ReviewFindingDraft,
  type ReviewFindingDecisionTarget,
  type SelectionProposalSegment,
} from "./lib/document-proposals";
export {
  isDocumentProposalStale,
  type DocumentProposalSnapshot,
} from "./lifecycle";
export {
  ProposalDecisionEngine,
  ProposalInvalidStateError,
  type ProposalAction,
} from "./lib/proposal-decision-engine";
