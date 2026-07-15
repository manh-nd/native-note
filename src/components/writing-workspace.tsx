"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronRight,
  Code,
  Heading1,
  Heading2,
  List,
  ListChecks,
  ListOrdered,
  Loader2,
  Minus,
  Plus,
  Quote,
  Save,
  Sparkles,
  X,
} from "lucide-react";
import type { Editor, JSONContent } from "@tiptap/core";
import type { DocumentOperationBatch } from "@/packages/document-editor";
import type { PageDocumentProposal } from "@/packages/document-proposals";
import { Button } from "@/components/ui/button";
import type { pages } from "@/db/schema";
import { Toaster } from "@/components/ui/sonner";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import { PracticeView } from "./practice-view";
import { LiveCoach } from "./live-coach";
import { EditorSession } from "./editor/editor-session";
import { BlockControls, type AiAction } from "./editor/block-controls";
import {
  AiCoachPanel,
  type AiTransform,
  type Finding,
} from "./editor/ai-coach-panel";
import {
  SlashCommandMenu,
  type EditorCommand,
} from "./editor/slash-command-menu";
import {
  blockSnapshot,
  insertTextBlocksAfter,
  isAiBlockResultStale,
  replaceBlockText,
} from "./editor/block-utils";
import {
  SelectionBubbleMenu,
  type SelectionAiAction,
  type SelectionBubbleState,
  type SelectionTone,
} from "./editor/selection-bubble-menu";
import {
  applySelectionAiResult,
  buildPlainTextIndex,
  clearSelectionAiPreview,
  selectionIsCurrent,
  selectionSegments,
  selectionSourcesForStaleOperations,
  selectionSourcesForOperations,
  selectionSnapshot,
  selectionAiResultsFromOperations,
  showSelectionAiPreview,
  preservedEditorSelection,
  type SelectionAiResult,
  type SelectionSourceSegment,
} from "./editor/selection-ai";

type PageRow = typeof pages.$inferSelect;
type User = {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
};
type View = "write" | "practice" | "live";
type SelectionRequestContext = {
  pageId: string;
  pageVersion: number;
  from: number;
  to: number;
  sources: SelectionSourceSegment[];
  action: SelectionAiAction;
  tone?: SelectionTone;
  instruction?: string;
  result?: SelectionAiResult;
};
type LoadedDocumentProposal = Pick<
  PageDocumentProposal,
  | "id"
  | "baseContentRevision"
  | "operations"
  | "summaryVi"
  | "action"
  | "status"
>;
type StaleProposalRecovery = Pick<
  SelectionRequestContext,
  "pageId" | "action" | "tone" | "instruction"
>;
type RunnableEditorCommand = EditorCommand & { run(): void };

const SLASH_COMMANDS: EditorCommand[] = [
  {
    key: "text",
    label: "Văn bản",
    hint: "Đoạn văn thường",
    icon: <Plus className="size-4" />,
  },
  {
    key: "h1",
    label: "Tiêu đề 1",
    hint: "Tiêu đề lớn",
    icon: <Heading1 className="size-4" />,
  },
  {
    key: "h2",
    label: "Tiêu đề 2",
    hint: "Tiêu đề vừa",
    icon: <Heading2 className="size-4" />,
  },
  {
    key: "bullet",
    label: "Danh sách",
    hint: "Bullet list",
    icon: <List className="size-4" />,
  },
  {
    key: "number",
    label: "Danh sách số",
    hint: "Numbered list",
    icon: <ListOrdered className="size-4" />,
  },
  {
    key: "task",
    label: "Việc cần làm",
    hint: "Task list",
    icon: <ListChecks className="size-4" />,
  },
  {
    key: "quote",
    label: "Trích dẫn",
    hint: "Quote block",
    icon: <Quote className="size-4" />,
  },
  {
    key: "code",
    label: "Mã",
    hint: "Code block",
    icon: <Code className="size-4" />,
  },
  {
    key: "divider",
    label: "Đường phân cách",
    hint: "Divider",
    icon: <Minus className="size-4" />,
  },
  {
    key: "review",
    label: "AI Review",
    hint: "Kiểm tra toàn bộ bài viết",
    icon: <Sparkles className="size-4" />,
  },
  {
    key: "practice",
    label: "Luyện tập",
    hint: "Ôn lỗi đã lưu",
    icon: <ChevronRight className="size-4" />,
  },
];

function filterSlashCommands<T extends EditorCommand>(
  commands: T[],
  query: string
) {
  return commands.filter((command) =>
    `${command.key} ${command.label}`.toLowerCase().includes(query)
  );
}

function isSelectionAiAction(action: string): action is SelectionAiAction {
  return [
    "improve",
    "natural",
    "rewrite",
    "shorten",
    "expand",
    "explain",
    "phrase",
    "custom",
  ].includes(action);
}

function isLoadedSelectionProposal(
  proposal: LoadedDocumentProposal
): proposal is LoadedDocumentProposal & { action: SelectionAiAction } {
  return isSelectionAiAction(proposal.action);
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const body = await response
      .json()
      .catch(() => ({ error: "Yêu cầu thất bại." }));
    throw new Error(body.error ?? "Yêu cầu thất bại.");
  }
  return response.json() as Promise<T>;
}

function revealHashBlock(editor: Editor, attempt = 0) {
  if (
    typeof window === "undefined" ||
    !window.location.hash.startsWith("#block=")
  )
    return;
  const blockId = decodeURIComponent(window.location.hash.slice(7));
  const selector = `[data-blockid="${CSS.escape(blockId)}"]`;
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) {
    if (attempt < 20)
      window.setTimeout(() => revealHashBlock(editor, attempt + 1), 50);
    return;
  }
  element.scrollIntoView({ behavior: "smooth", block: "center" });
  editor.commands.highlightBlock(blockId);
  window.setTimeout(() => editor.commands.highlightBlock(null), 1800);
}

export function WritingWorkspace({
  initialPages,
  user,
  initialActivePageId,
  defaultSidebarOpen = true,
}: {
  initialPages: PageRow[];
  user: User;
  initialActivePageId?: string;
  defaultSidebarOpen?: boolean;
}) {
  const [pageList, setPageList] = useState(initialPages);
  const [activeId, setActiveId] = useState(
    initialPages.some((page) => page.id === initialActivePageId)
      ? initialActivePageId!
      : initialPages[0].id
  );
  const [view, setView] = useState<View>("write");
  const [findings, setFindings] = useState<Finding[]>([]);
  const [transform, setTransform] = useState<AiTransform | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );
  const [reviewing, setReviewing] = useState(false);
  const [selectionAi, setSelectionAi] = useState<SelectionBubbleState>({
    mode: "idle",
  });
  const [slash, setSlash] = useState({
    open: false,
    query: "",
    x: 0,
    y: 0,
    selected: 0,
  });
  const activePage =
    pageList.find((page) => page.id === activeId) ?? pageList[0];
  const pagesRef = useRef(pageList);
  const activeIdRef = useRef(activeId);
  const contentSaveChains = useRef(new Map<string, Promise<void>>());
  const contentSaveGenerations = useRef(new Map<string, number>());
  const dirtyContentPages = useRef(new Set<string>());
  const metadataSaveChains = useRef(new Map<string, Promise<void>>());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slashRef = useRef(slash);
  const slashCommandsRef = useRef<RunnableEditorCommand[]>([]);
  const executeRef = useRef<(index: number) => void>(() => undefined);
  const selectionAiRef = useRef(selectionAi);
  const selectionContextRef = useRef<SelectionRequestContext | null>(null);
  const selectionAbortRef = useRef<AbortController | null>(null);
  const ignoreCanonicalEditorUpdate = useRef(false);
  const lastTextSelectionRef = useRef<{ from: number; to: number } | null>(
    null
  );
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [editorPageId, setEditorPageId] = useState<string | null>(null);
  const [staleProposalRecovery, setStaleProposalRecovery] =
    useState<StaleProposalRecovery | null>(null);
  const [proposalReloadKey, setProposalReloadKey] = useState(0);

  useEffect(() => {
    slashRef.current = slash;
  }, [slash]);
  useEffect(() => {
    pagesRef.current = pageList;
  }, [pageList]);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);
  useEffect(() => {
    selectionAiRef.current = selectionAi;
  }, [selectionAi]);

  const updateSelectionAi = useCallback((next: SelectionBubbleState) => {
    selectionAiRef.current = next;
    setSelectionAi(next);
  }, []);

  const updatePage = useCallback(
    (updated: PageRow, kind: "content" | "metadata" | "full" = "full") => {
      pagesRef.current = pagesRef.current
        .map((page) => {
          if (page.id !== updated.id) return page;
          if (kind === "content")
            return {
              ...page,
              contentRevision: updated.contentRevision,
              version: Math.max(page.version, updated.version),
              updatedAt: updated.updatedAt,
            };
          if (kind === "metadata")
            return {
              ...page,
              title: updated.title,
              parentId: updated.parentId,
              position: updated.position,
              metadataRevision: updated.metadataRevision,
              version: Math.max(page.version, updated.version),
              updatedAt: updated.updatedAt,
            };
          return updated;
        })
        .sort((a, b) => a.position - b.position);
      setPageList(pagesRef.current);
    },
    []
  );

  const enqueueSave = useCallback(
    (
      chains: Map<string, Promise<void>>,
      id: string,
      run: () => Promise<void>
    ) => {
      const previous = chains.get(id) ?? Promise.resolve();
      const next = previous.catch(() => undefined).then(run);
      chains.set(
        id,
        next.catch(() => undefined)
      );
      return next;
    },
    []
  );

  const persistContent = useCallback(
    (content: JSONContent, id: string, generation?: number) =>
      enqueueSave(contentSaveChains.current, id, async () => {
        setSaving("saving");
        try {
          const contentRevision = pagesRef.current.find(
            (page) => page.id === id
          )?.contentRevision;
          if (!contentRevision) return;
          const result = await api<{ page: PageRow }>(`/api/pages/${id}`, {
            method: "PATCH",
            body: JSON.stringify({ content, contentRevision }),
          });
          updatePage(result.page, "content");
          if (
            generation === undefined ||
            contentSaveGenerations.current.get(id) === generation
          )
            dirtyContentPages.current.delete(id);
          setSaving("saved");
          setTimeout(() => setSaving("idle"), 1200);
        } catch (cause) {
          setSaving("error");
          setError(
            cause instanceof Error ? cause.message : "Không thể lưu trang."
          );
          throw cause;
        }
      }),
    [enqueueSave, updatePage]
  );

  const persistMetadata = useCallback(
    (
      patch: Partial<Pick<PageRow, "title" | "parentId" | "position">>,
      id: string
    ) =>
      enqueueSave(metadataSaveChains.current, id, async () => {
        setSaving("saving");
        try {
          const metadataRevision = pagesRef.current.find(
            (page) => page.id === id
          )?.metadataRevision;
          if (!metadataRevision) return;
          const result = await api<{ page: PageRow }>(`/api/pages/${id}`, {
            method: "PATCH",
            body: JSON.stringify({ ...patch, metadataRevision }),
          });
          updatePage(result.page, "metadata");
          setSaving("saved");
          setTimeout(() => setSaving("idle"), 1200);
        } catch (cause) {
          setSaving("error");
          setError(
            cause instanceof Error ? cause.message : "Không thể lưu trang."
          );
          throw cause;
        }
      }),
    [enqueueSave, updatePage]
  );

  const handleEditorKeyDown = useCallback((event: KeyboardEvent) => {
    const current = slashRef.current;
    if (!current.open) return false;
    const count = filterSlashCommands(
      slashCommandsRef.current,
      current.query
    ).length;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSlash((value) => ({
        ...value,
        selected: (value.selected + 1) % Math.max(count, 1),
      }));
      return true;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSlash((value) => ({
        ...value,
        selected:
          (value.selected - 1 + Math.max(count, 1)) % Math.max(count, 1),
      }));
      return true;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      executeRef.current(current.selected);
      return true;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setSlash((value) => ({ ...value, open: false }));
      return true;
    }
    return false;
  }, []);

  const handleEditorUpdate = useCallback(
    (current: Editor) => {
      if (ignoreCanonicalEditorUpdate.current) {
        ignoreCanonicalEditorUpdate.current = false;
        return;
      }
      if (
        selectionContextRef.current &&
        selectionAiRef.current.mode !== "idle"
      ) {
        selectionAbortRef.current?.abort();
        clearSelectionAiPreview(current);
        updateSelectionAi({ mode: "stale" });
      }
      const { $from } = current.state.selection;
      const before = $from.parent.textBetween(
        0,
        $from.parentOffset,
        undefined,
        "\ufffc"
      );
      const match = before.match(/\/([a-z]*)$/i);
      if (match) {
        const coords = current.view.coordsAtPos(current.state.selection.from);
        setSlash((value) => ({
          open: true,
          query: match[1].toLowerCase(),
          x: Math.min(coords.left, window.innerWidth - 330),
          y: Math.min(coords.bottom + 6, window.innerHeight - 360),
          selected: value.query === match[1] ? value.selected : 0,
        }));
      } else
        setSlash((value) => (value.open ? { ...value, open: false } : value));
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const snapshot = pagesRef.current.find(
        (page) => page.id === activeIdRef.current
      );
      if (snapshot) {
        const generation =
          (contentSaveGenerations.current.get(snapshot.id) ?? 0) + 1;
        contentSaveGenerations.current.set(snapshot.id, generation);
        dirtyContentPages.current.add(snapshot.id);
        saveTimer.current = setTimeout(
          () =>
            void persistContent(
              current.getJSON(),
              snapshot.id,
              generation
            ).catch(() => undefined),
          900
        );
      }
    },
    [persistContent, updateSelectionAi]
  );

  const handleEditorSelectionUpdate = useCallback(
    (current: Editor) => {
      if (!current.state.selection.empty)
        lastTextSelectionRef.current = {
          from: current.state.selection.from,
          to: current.state.selection.to,
        };
      const context = selectionContextRef.current;
      if (!context || selectionAiRef.current.mode === "idle") return;
      const { from, to } = current.state.selection;
      if (from === context.from && to === context.to) return;
      selectionAbortRef.current?.abort();
      clearSelectionAiPreview(current);
      updateSelectionAi({ mode: "stale" });
    },
    [updateSelectionAi]
  );

  const handleEditorCreate = useCallback(
    (current: Editor, pageId: string) => {
      const currentPage = pagesRef.current.find((page) => page.id === pageId);
      if (
        currentPage &&
        currentPage.plainText !== buildPlainTextIndex(current.state.doc).text
      )
        void persistContent(current.getJSON(), currentPage.id).catch(
          () => undefined
        );
      window.setTimeout(() => revealHashBlock(current), 0);
    },
    [persistContent]
  );

  useEffect(() => {
    if (!editor) return;
    const onHashChange = () => revealHashBlock(editor);
    revealHashBlock(editor);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [activeId, editor]);

  const flushEditor = useCallback(async () => {
    if (!editor || !activePage) return;
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    await (contentSaveChains.current.get(activePage.id) ?? Promise.resolve());
    const current =
      pagesRef.current.find((page) => page.id === activePage.id) ?? activePage;
    if (dirtyContentPages.current.has(current.id)) {
      await persistContent(
        editor.getJSON(),
        current.id,
        contentSaveGenerations.current.get(current.id)
      );
    }
    return pagesRef.current.find((page) => page.id === current.id) ?? current;
  }, [activePage, editor, persistContent]);

  const review = useCallback(async () => {
    if (!editor || !activePage) return;
    setReviewing(true);
    setError("");
    setTransform(null);
    try {
      await flushEditor();
      const result = await api<{ findings: Finding[] }>("/api/ai/review", {
        method: "POST",
        body: JSON.stringify({ pageId: activePage.id, scope: null }),
      });
      setFindings(result.findings);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể review.");
    } finally {
      setReviewing(false);
    }
  }, [editor, activePage, flushEditor]);

  const runTransform = useCallback(
    async (action: AiAction, blockId: string) => {
      if (!editor || !activePage) return;
      const snapshot = blockSnapshot(editor, blockId);
      const text = snapshot;
      if (!text?.trim()) return setError("Hãy viết một đoạn trước.");
      const sourceSnapshot = text;
      setReviewing(true);
      setError("");
      try {
        const currentPage = await flushEditor();
        if (!currentPage) return;
        const result = await api<
          Omit<AiTransform, "range" | "snapshot" | "stale">
        >("/api/ai/transform", {
          method: "POST",
          body: JSON.stringify({
            pageId: activePage.id,
            action,
            tone: "natural",
            text,
            scope: "block",
            blockId,
            pageVersion: currentPage.version,
          }),
        });
        const livePage = pagesRef.current.find(
          (page) => page.id === activePage.id
        );
        const stale = Boolean(
          result.pageVersion &&
          isAiBlockResultStale(
            blockSnapshot(editor, blockId),
            livePage?.version,
            sourceSnapshot,
            result.pageVersion
          )
        );
        setTransform({
          ...result,
          range: { from: 0, to: 0 },
          blockId,
          snapshot: sourceSnapshot,
          stale,
          action,
        });
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Không thể xử lý yêu cầu."
        );
      } finally {
        setReviewing(false);
      }
    },
    [editor, activePage, flushEditor]
  );

  const runSelectionTransform = useCallback(
    async (
      action: SelectionAiAction,
      tone?: SelectionTone,
      instruction?: string,
      range?: { from: number; to: number }
    ) => {
      if (!editor || !activePage) return;
      const sourceRange =
        range ??
        (editor.state.selection.empty
          ? (preservedEditorSelection(editor) ??
            lastTextSelectionRef.current ??
            undefined)
          : {
              from: editor.state.selection.from,
              to: editor.state.selection.to,
            });
      const sources = selectionSegments(editor, sourceRange);
      const total = sources.reduce(
        (sum, segment) => sum + segment.text.length,
        0
      );
      if (!sources.length)
        return setError("Hãy chọn một đoạn văn trước khi gọi AI.");
      if (sources.length > 30 || total > 5000)
        return setError("Chỉ chọn tối đa 30 đoạn và 5.000 ký tự.");
      const from = sourceRange?.from ?? editor.state.selection.from;
      const to = sourceRange?.to ?? editor.state.selection.to;
      selectionAbortRef.current?.abort();
      const controller = new AbortController();
      selectionAbortRef.current = controller;

      const isExplanatory = action === "explain" || action === "phrase";
      if (isExplanatory) {
        setReviewing(true);
        setTransform(null);
        updateSelectionAi({ mode: "idle" });
        clearSelectionAiPreview(editor);
      } else {
        updateSelectionAi({ mode: "loading" });
      }
      setError("");
      try {
        const savedPage = await flushEditor();
        if (!savedPage || controller.signal.aborted) return;
        const context: SelectionRequestContext = {
          pageId: savedPage.id,
          pageVersion: savedPage.version,
          from,
          to,
          sources,
          action,
          tone,
          instruction,
        };
        selectionContextRef.current = context;
        const result = await api<SelectionAiResult>("/api/ai/transform", {
          method: "POST",
          signal: controller.signal,
          body: JSON.stringify({
            pageId: savedPage.id,
            scope: "selection",
            action,
            tone,
            instruction,
            pageVersion: savedPage.version,
            snapshot: selectionSnapshot(sources),
            segments: sources.map((segment) => ({
              id: segment.id,
              from: segment.plainFrom,
              to: segment.plainTo,
              text: segment.text,
              nodeType: segment.nodeType,
              blockId: segment.blockId,
              blockFrom: segment.blockFrom,
              blockTo: segment.blockTo,
            })),
          }),
        });
        const livePage = pagesRef.current.find(
          (page) => page.id === savedPage.id
        );
        if (controller.signal.aborted) return;
        if (isExplanatory) {
          setTransform({
            result: selectionSnapshot(sources),
            explanationVi: result.summaryVi,
            alternatives: [],
            range: { from, to },
            action,
          });
          setReviewing(false);
          selectionContextRef.current = null;
          return;
        }
        if (
          livePage?.version !== result.pageVersion ||
          !selectionIsCurrent(editor, sources)
        ) {
          updateSelectionAi({ mode: "stale" });
          return;
        }
        selectionContextRef.current = { ...context, result };
        if (result.noChange)
          updateSelectionAi({
            mode: "no-change",
            summary: result.summaryVi || "Đoạn này đã ổn.",
          });
        else {
          showSelectionAiPreview(
            editor,
            sources,
            selectionAiResultsFromOperations(sources, result.operations)
          );
          updateSelectionAi({ mode: "preview", summary: result.summaryVi });
        }
      } catch (cause) {
        if (controller.signal.aborted) return;
        selectionContextRef.current = null;
        updateSelectionAi({ mode: "idle" });
        setReviewing(false);
        setError(
          cause instanceof Error
            ? cause.message
            : "Không thể chỉnh đoạn đã chọn."
        );
      }
    },
    [activePage, editor, flushEditor, updateSelectionAi]
  );

  const regenerateSelectionTransform = useCallback(() => {
    const context = selectionContextRef.current;
    if (!context || !editor || editor.state.selection.empty) {
      setError("Hãy chọn đoạn cần tạo lại đề xuất.");
      return;
    }
    setStaleProposalRecovery(null);
    void runSelectionTransform(
      context.action,
      context.tone,
      context.instruction,
      {
        from: editor.state.selection.from,
        to: editor.state.selection.to,
      }
    );
  }, [editor, runSelectionTransform]);

  const rejectSelectionTransform = useCallback(async () => {
    const context = selectionContextRef.current;
    selectionAbortRef.current?.abort();
    selectionContextRef.current = null;
    if (editor) clearSelectionAiPreview(editor);
    updateSelectionAi({ mode: "idle" });
    if (
      context?.result?.proposalId &&
      selectionAiRef.current.mode !== "stale"
    ) {
      try {
        await api(
          `/api/document-proposals/${context.result.proposalId}/reject`,
          {
            method: "POST",
          }
        );
        setProposalReloadKey((value) => value + 1);
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Không thể bỏ kết quả AI."
        );
      }
    }
  }, [editor, updateSelectionAi]);

  useEffect(() => {
    if (!editor || editorPageId !== activePage.id) return;
    const controller = new AbortController();
    void api<{ page: PageRow; proposals: LoadedDocumentProposal[] }>(
      `/api/document-proposals?pageId=${activePage.id}`,
      { signal: controller.signal }
    )
      .then(({ page, proposals }) => {
        if (controller.signal.aborted) return;
        setStaleProposalRecovery(null);
        const selectionProposals = proposals.filter(isLoadedSelectionProposal);
        const proposal =
          selectionProposals.find(
            (candidate) => candidate.status === "pending"
          ) ?? selectionProposals[0];
        if (!proposal) return;
        const sources =
          proposal.status === "stale"
            ? selectionSourcesForStaleOperations(editor, proposal.operations)
            : selectionSourcesForOperations(editor, proposal.operations);
        if (!sources?.length) {
          if (proposal.status !== "stale") return;
          selectionContextRef.current = {
            pageId: page.id,
            pageVersion: page.version,
            from: 0,
            to: 0,
            sources: [],
            action: proposal.action,
          };
          setStaleProposalRecovery({
            pageId: page.id,
            action: proposal.action,
          });
          return;
        }
        const from = Math.min(...sources.map((source) => source.pmFrom));
        const to = Math.max(...sources.map((source) => source.pmTo));
        selectionContextRef.current = {
          pageId: page.id,
          pageVersion: page.version,
          from,
          to,
          sources,
          action: proposal.action,
          result: {
            proposalId: proposal.id,
            baseContentRevision: proposal.baseContentRevision,
            pageVersion: page.version,
            noChange: false,
            summaryVi: proposal.summaryVi,
            operations: proposal.operations,
          },
        };
        if (proposal.status === "pending") {
          showSelectionAiPreview(
            editor,
            sources,
            selectionAiResultsFromOperations(sources, proposal.operations)
          );
          updateSelectionAi({ mode: "preview", summary: proposal.summaryVi });
        } else {
          setStaleProposalRecovery(null);
          updateSelectionAi({ mode: "stale" });
        }
        editor.commands.setTextSelection({ from, to });
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Không thể tải đề xuất đang chờ."
          );
      });
    return () => controller.abort();
  }, [
    activePage.id,
    editor,
    editorPageId,
    proposalReloadKey,
    updateSelectionAi,
  ]);

  const acceptSelectionTransform = useCallback(async () => {
    const context = selectionContextRef.current;
    if (!editor || !context?.result || context.result.noChange) return;
    const livePage = pagesRef.current.find(
      (page) => page.id === context.pageId
    );
    if (
      livePage?.version !== context.pageVersion ||
      !selectionIsCurrent(editor, context.sources)
    ) {
      updateSelectionAi({ mode: "stale" });
      return;
    }
    try {
      editor.setEditable(false);
      const accepted = await api<{
        page?: PageRow;
        proposal?: { operations: DocumentOperationBatch };
      }>(`/api/document-proposals/${context.result.proposalId}/accept`, {
        method: "POST",
      });
      selectionContextRef.current = null;
      updateSelectionAi({ mode: "idle" });
      try {
        ignoreCanonicalEditorUpdate.current = true;
        if (
          !applySelectionAiResult(
            editor,
            context.sources,
            selectionAiResultsFromOperations(
              context.sources,
              accepted.proposal?.operations ?? context.result.operations
            ),
            "server-canonical-proposal"
          )
        )
          throw new Error("Canonical operation no longer matches the editor.");
        if (accepted.page) updatePage(accepted.page, "full");
        editor.commands.focus();
      } catch {
        if (accepted.page) {
          editor.commands.setContent(accepted.page.content as JSONContent, {
            emitUpdate: false,
          });
          updatePage(accepted.page, "full");
          setError("Đã tải lại nội dung canonical từ máy chủ.");
        } else updateSelectionAi({ mode: "stale" });
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Không thể áp dụng kết quả AI."
      );
      updateSelectionAi({ mode: "stale" });
    } finally {
      editor.setEditable(true);
      setProposalReloadKey((value) => value + 1);
    }
  }, [editor, updatePage, updateSelectionAi]);

  const commandRunners: Record<string, () => void> = {
    text: () => editor?.chain().focus().setParagraph().run(),
    h1: () => editor?.chain().focus().toggleHeading({ level: 1 }).run(),
    h2: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(),
    bullet: () => editor?.chain().focus().toggleBulletList().run(),
    number: () => editor?.chain().focus().toggleOrderedList().run(),
    task: () => editor?.chain().focus().toggleTaskList().run(),
    quote: () => editor?.chain().focus().toggleBlockquote().run(),
    code: () => editor?.chain().focus().toggleCodeBlock().run(),
    divider: () => editor?.chain().focus().setHorizontalRule().run(),
    review,
    practice: () => setView("practice"),
  };
  const commands: RunnableEditorCommand[] = SLASH_COMMANDS.map((command) => ({
    ...command,
    run: commandRunners[command.key],
  }));
  const visibleSlashCommands = filterSlashCommands(SLASH_COMMANDS, slash.query);
  useEffect(() => {
    slashCommandsRef.current = commands;
  }, [commands]);
  const chooseSlashCommand = useCallback(
    (index: number) => {
      if (!editor) return;
      const command = filterSlashCommands(commands, slash.query)[index];
      if (!command) return;
      const cursor = editor.state.selection.from;
      editor
        .chain()
        .focus()
        .deleteRange({ from: cursor - slash.query.length - 1, to: cursor })
        .run();
      setSlash((value) => ({ ...value, open: false }));
      command.run();
    },
    [commands, editor, slash.query]
  );
  useEffect(() => {
    executeRef.current = chooseSlashCommand;
  }, [chooseSlashCommand]);

  const loadPage = useCallback(
    async (id: string) => {
      const result = await api<{ pages: PageRow[] }>("/api/pages");
      const page = result.pages.find((candidate) => candidate.id === id);
      if (!page) throw new Error("Không tìm thấy trang.");
      updatePage(page);
      return page;
    },
    [updatePage]
  );

  async function addPage() {
    try {
      await flushEditor();
      const result = await api<{ page: PageRow }>("/api/pages", {
        method: "POST",
        body: JSON.stringify({ title: "Trang mới" }),
      });
      pagesRef.current = [...pagesRef.current, result.page];
      setPageList(pagesRef.current);
      setActiveId(result.page.id);
      setView("write");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể tạo trang.");
    }
  }
  async function deletePage(pageId: string) {
    if (pageList.length <= 1) return false;
    try {
      if (pageId === activeId) await flushEditor();
      const result = await api<{ deletedIds: string[] }>(
        `/api/pages/${pageId}`,
        { method: "DELETE" }
      );
      const deleted = new Set(result.deletedIds);
      const next = pagesRef.current.filter((page) => !deleted.has(page.id));
      if (!next.length) throw new Error("Cần giữ lại ít nhất một trang.");
      pagesRef.current = next;
      setPageList(next);
      if (deleted.has(activeId)) {
        const nextActiveId = next[0].id;
        await loadPage(nextActiveId);
        setActiveId(nextActiveId);
        setView("write");
        window.history.replaceState(
          null,
          "",
          `/workspace?page=${nextActiveId}`
        );
      }
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể xóa trang.");
      return false;
    }
  }
  async function movePage(
    pageId: string,
    action: "up" | "down" | "indent" | "outdent"
  ) {
    const pages = pagesRef.current;
    const page = pages.find((candidate) => candidate.id === pageId);
    if (!page) return;
    const currentIndex = pages.findIndex(
      (candidate) => candidate.id === pageId
    );
    const siblings = pages
      .filter((candidate) => candidate.parentId === page.parentId)
      .sort((a, b) => a.position - b.position);
    const siblingPosition = siblings.findIndex(
      (candidate) => candidate.id === pageId
    );
    if (action === "indent") {
      const previous = pages[currentIndex - 1];
      if (previous && previous.id !== page.id)
        await persistMetadata(
          { parentId: previous.id, position: previous.position },
          page.id
        );
    } else if (action === "outdent") {
      await persistMetadata(
        { parentId: null, position: pages.length },
        page.id
      );
    } else {
      const target = siblings[siblingPosition + (action === "up" ? -1 : 1)];
      if (!target) return;
      const oldPosition = page.position;
      await persistMetadata({ position: target.position }, page.id);
      await persistMetadata({ position: oldPosition }, target.id);
    }
  }
  async function selectPage(id: string) {
    if (id === activeId) return;
    try {
      await flushEditor();
      await loadPage(id);
    } catch {
      return;
    }
    selectionAbortRef.current?.abort();
    selectionContextRef.current = null;
    updateSelectionAi({ mode: "idle" });
    setFindings([]);
    setTransform(null);
    setError("");
    setActiveId(id);
    setView("write");
    window.history.replaceState(null, "", `/workspace?page=${id}`);
  }
  async function renamePage(id: string) {
    await selectPage(id);
    window.setTimeout(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }, 0);
  }

  function findEditorRange(original: string) {
    if (!editor) return null;
    for (let pos = 1; pos <= editor.state.doc.content.size; pos += 1) {
      const text = editor.state.doc.textBetween(
        pos,
        Math.min(editor.state.doc.content.size, pos + original.length + 1),
        "\n"
      );
      if (text.startsWith(original))
        return { from: pos, to: pos + original.length };
    }
    return null;
  }
  async function handleFinding(
    finding: Finding,
    action: "apply" | "dismiss" | "save"
  ) {
    try {
      const result = await api<{ suggestion: string }>(
        `/api/findings/${finding.id}/${action}`,
        { method: "POST" }
      );
      if (action === "apply" && editor) {
        const range = findEditorRange(finding.original);
        if (!range)
          throw new Error("Không còn tìm thấy đoạn gốc trong editor.");
        editor.chain().focus().insertContentAt(range, result.suggestion).run();
      }
      setFindings((current) =>
        current.filter((item) => item.id !== finding.id)
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Không thể xử lý góp ý."
      );
    }
  }
  function applyTransform(mode: "replace" | "insert") {
    if (!editor || !transform) return;
    if (transform.blockId) {
      const current = blockSnapshot(editor, transform.blockId);
      const pageVersion = pagesRef.current.find(
        (page) => page.id === activePage.id
      )?.version;
      if (
        !transform.snapshot ||
        !transform.pageVersion ||
        isAiBlockResultStale(
          current,
          pageVersion,
          transform.snapshot,
          transform.pageVersion
        )
      ) {
        setTransform({ ...transform, stale: true });
        return;
      }
      if (mode === "replace")
        replaceBlockText(editor, transform.blockId, transform.result);
      else insertTextBlocksAfter(editor, transform.blockId, transform.result);
    } else if (mode === "replace" && transform.range.from > 0)
      editor
        .chain()
        .focus()
        .insertContentAt(transform.range, transform.result)
        .run();
    setTransform(null);
  }

  return (
    <SidebarProvider defaultOpen={defaultSidebarOpen}>
      <WorkspaceSidebar
        activeId={activeId}
        pages={pageList}
        user={user}
        onAddPage={addPage}
        onDeletePage={deletePage}
        onMovePage={movePage}
        onPractice={() => setView("practice")}
        onRenamePage={renamePage}
        onSelectPage={selectPage}
      />
      <SidebarInset>
        {view === "practice" ? (
          <PracticeView
            onBack={() => setView("write")}
            onLive={() => setView("live")}
          />
        ) : view === "live" ? (
          <LiveCoach onBack={() => setView("practice")} />
        ) : (
          <div className="app-shell">
            <section className="editor-column">
              <div className="editor-topbar">
                <div className="editor-topbar-leading">
                  <SidebarTrigger aria-label="Ẩn hoặc mở thanh điều hướng" />
                  <span>Workspace cá nhân</span>
                </div>
                <span className="save-state">
                  {saving === "saving" ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : saving === "error" ? (
                    <X size={14} />
                  ) : saving === "saved" ? (
                    <Check size={14} />
                  ) : (
                    <Save size={14} />
                  )}{" "}
                  {saving === "saving"
                    ? "Đang lưu"
                    : saving === "error"
                      ? "Lỗi lưu"
                      : "Đã lưu"}
                </span>
              </div>
              <input
                ref={titleInputRef}
                className="title-input"
                aria-label="Tiêu đề trang"
                value={activePage.title}
                onChange={(event) => {
                  pagesRef.current = pagesRef.current.map((page) =>
                    page.id === activePage.id
                      ? { ...page, title: event.target.value }
                      : page
                  );
                  setPageList(pagesRef.current);
                }}
                onBlur={() =>
                  void persistMetadata(
                    { title: activePage.title || "Không có tiêu đề" },
                    activePage.id
                  ).catch(() => undefined)
                }
              />
              {error && (
                <div className="error-banner" role="alert">
                  {error}
                </div>
              )}
              {staleProposalRecovery?.pageId === activePage.id && (
                <div className="error-banner" role="status">
                  Đề xuất không còn khớp với đoạn cũ. Hãy chọn đoạn cần sửa rồi
                  <Button size="sm" onClick={regenerateSelectionTransform}>
                    <Sparkles data-icon="inline-start" />
                    Tạo lại
                  </Button>
                </div>
              )}
              <div className="notion-editor-shell">
                <EditorSession
                  key={activePage.id}
                  pageId={activePage.id}
                  content={activePage.content as JSONContent}
                  onReady={(current) => {
                    setEditor(current);
                    setEditorPageId(activePage.id);
                  }}
                  onUpdate={handleEditorUpdate}
                  onSelectionUpdate={handleEditorSelectionUpdate}
                  onCreate={handleEditorCreate}
                  onKeyDown={handleEditorKeyDown}
                />
                {editor && (
                  <>
                    <SelectionBubbleMenu
                      editor={editor}
                      state={selectionAi}
                      onRequest={runSelectionTransform}
                      onAccept={acceptSelectionTransform}
                      onReject={rejectSelectionTransform}
                      onAbort={rejectSelectionTransform}
                      onRegenerate={regenerateSelectionTransform}
                    />
                    <BlockControls
                      editor={editor}
                      pageId={activePage.id}
                      onAskAI={runTransform}
                    />
                  </>
                )}
              </div>
            </section>
            <AiCoachPanel
              findings={findings}
              transform={transform}
              loading={reviewing}
              onFinding={handleFinding}
              onTransform={applyTransform}
              onCloseTransform={() => setTransform(null)}
            />
            {slash.open && (
              <SlashCommandMenu
                x={slash.x}
                y={slash.y}
                commands={visibleSlashCommands}
                selected={slash.selected}
                onChoose={chooseSlashCommand}
              />
            )}
          </div>
        )}
        <Toaster />
      </SidebarInset>
    </SidebarProvider>
  );
}
