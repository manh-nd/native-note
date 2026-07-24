"use client";

import { useCallback, useState } from "react";
import type { Editor } from "@tiptap/core";
import { DecorationSet } from "@tiptap/pm/view";
import type { DocumentOperationBatch } from "@/packages/document-editor";
import {
  createDocumentProposalEngine,
  type DocumentProposalEngine,
  type PageDocumentProposal,
} from "@/packages/document-proposals";
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

const defaultEngine = createDocumentProposalEngine();

export function isProposalStale(
  proposal: PendingProposal | PageDocumentProposal | null,
  currentContentRevision: number,
  engine: DocumentProposalEngine = defaultEngine
): boolean {
  if (!proposal) return false;
  return engine.isStale(
    proposal as PageDocumentProposal,
    currentContentRevision
  );
}

export function createProposalDecorationSet(
  proposal: PendingProposal | null,
  currentContentRevision: number,
  engine: DocumentProposalEngine = defaultEngine
): DecorationSet | null {
  if (!proposal || isProposalStale(proposal, currentContentRevision, engine)) {
    return null;
  }
  return null;
}

export function useProposalOrchestrator(
  engine: DocumentProposalEngine = defaultEngine
) {
  const [proposal, setProposal] = useState<PendingProposal | null>(null);

  const isStale = useCallback(
    (currentContentRevision: number) => {
      return isProposalStale(proposal, currentContentRevision, engine);
    },
    [proposal, engine]
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
    engine,
  };
}
