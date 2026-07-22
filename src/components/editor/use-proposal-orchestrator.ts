"use client";

import { useCallback, useState } from "react";
import type { Editor } from "@tiptap/core";
import { DecorationSet } from "@tiptap/pm/view";
import type { DocumentOperationBatch } from "@/packages/document-editor";
import {
  showDocumentProposalPreview,
  clearSelectionAiPreview,
} from "./selection-ai";

export type ProposalScope = "selection" | "block" | "page" | "agent";

export type PendingProposal = {
  id: string;
  scope: ProposalScope;
  baseContentRevision: number;
  summaryVi: string;
  operations: DocumentOperationBatch;
};

export function isProposalStale(
  proposal: PendingProposal | null,
  currentContentRevision: number
): boolean {
  if (!proposal) return false;
  return proposal.baseContentRevision < currentContentRevision;
}

export function createProposalDecorationSet(
  proposal: PendingProposal | null,
  currentContentRevision: number
): DecorationSet | null {
  if (!proposal || isProposalStale(proposal, currentContentRevision)) {
    return null;
  }
  return null;
}

export function useProposalOrchestrator() {
  const [proposal, setProposal] = useState<PendingProposal | null>(null);

  const isStale = useCallback(
    (currentContentRevision: number) => {
      return isProposalStale(proposal, currentContentRevision);
    },
    [proposal]
  );

  const showPreview = useCallback(
    (editor: Editor, newProposal: PendingProposal) => {
      setProposal(newProposal);
      showDocumentProposalPreview(editor, newProposal.operations);
    },
    []
  );

  const clearPreview = useCallback((editor: Editor) => {
    clearSelectionAiPreview(editor);
    setProposal(null);
  }, []);

  return {
    proposal,
    setProposal,
    isStale,
    showPreview,
    clearPreview,
  };
}
