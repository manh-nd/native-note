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
import {
  applyDocumentOperationsToEditor,
  type DocumentOperationBatch,
} from "@/packages/document-editor";
import type { PageDocumentProposal } from "@/packages/document-proposals";
import { Button } from "@/components/ui/button";
import type { pages, skills, skillVersions } from "@/db/schema";
import type { MenuSkill } from "@/packages/skills";
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
import {
  BlockControls,
  type AiAction,
  type BlockAiBehavior,
} from "./editor/block-controls";
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
  editorSkillRange,
  isAiBlockResultStale,
  isSupportedSkillBlock,
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
type SkillRow = typeof skills.$inferSelect;
type SkillVersionRow = typeof skillVersions.$inferSelect;
type User = {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
};
type View = "write" | "practice" | "live";
type SelectionRequestContext = {
  pageId: string;
  contentRevision: number;
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
  | "sourceKind"
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

function isBlockAiAction(action: string): action is AiAction {
  return [
    "improve",
    "natural",
    "rewrite",
    "shorten",
    "expand",
    "explain",
    "phrase",
  ].includes(action);
}

function isLoadedSelectionProposal(
  proposal: LoadedDocumentProposal
): proposal is LoadedDocumentProposal & { action: SelectionAiAction } {
  return (
    proposal.sourceKind === "selection" && isSelectionAiAction(proposal.action)
  );
}

function isLoadedBlockProposal(proposal: LoadedDocumentProposal) {
  return proposal.sourceKind === "block";
}

function blockProposalTarget(batch: DocumentOperationBatch) {
  const operation = batch.operations[0];
  return operation?.type === "replace-text" ||
    operation?.type === "insert-blocks-after"
    ? operation.target
    : null;
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
    throw Object.assign(new Error(body.error ?? "Yêu cầu thất bại."), {
      code: body.code,
    });
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
  initialSkills,
  initialMenuSkills,
  user,
  initialActivePageId,
  defaultSidebarOpen = true,
}: {
  initialPages: PageRow[];
  initialSkills: SkillRow[];
  initialMenuSkills: MenuSkill[];
  user: User;
  initialActivePageId?: string;
  defaultSidebarOpen?: boolean;
}) {
  const [pageList, setPageList] = useState(initialPages);
  const [skillsByPageId, setSkillsByPageId] = useState<
    Record<string, SkillRow>
  >(() =>
    Object.fromEntries(initialSkills.map((skill) => [skill.pageId, skill]))
  );
  const [activeSkillVersions, setActiveSkillVersions] = useState<
    SkillVersionRow[]
  >([]);
  const [menuSkills, setMenuSkills] = useState(initialMenuSkills);
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
  const activeSkill = skillsByPageId[activePage.id];
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
  useEffect(() => {
    let cancelled = false;
    if (!activeSkill) return;
    void api<{ versions: SkillVersionRow[] }>(
      `/api/pages/${activeSkill.pageId}/skill/versions`
    )
      .then((result) => {
        if (!cancelled) setActiveSkillVersions(result.versions);
      })
      .catch((cause) => {
        if (!cancelled)
          setError(
            cause instanceof Error
              ? cause.message
              : "Không thể tải lịch sử Skill."
          );
      });
    return () => {
      cancelled = true;
    };
  }, [activeSkill]);

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
              updatedAt: updated.updatedAt,
            };
          if (kind === "metadata")
            return {
              ...page,
              title: updated.title,
              parentId: updated.parentId,
              position: updated.position,
              metadataRevision: updated.metadataRevision,
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
    async (action: AiAction, blockId: string, behavior: BlockAiBehavior) => {
      if (!editor || !activePage) return;
      const snapshot = blockSnapshot(editor, blockId);
      const text = snapshot;
      if (!text?.trim()) return setError("Hãy viết một đoạn trước.");
      const sourceSnapshot = text;
      const isExplanatory = action === "explain" || action === "phrase";
      setReviewing(true);
      setError("");
      try {
        const currentPage = await flushEditor();
        if (!currentPage) return;
        const result = await api<
          Omit<AiTransform, "range" | "snapshot" | "stale" | "blockId">
        >("/api/ai/actions", {
          method: "POST",
          body: JSON.stringify({
            pageId: activePage.id,
            action,
            tone: "natural",
            text,
            scope: "block",
            behavior,
            blockId,
            contentRevision: currentPage.contentRevision,
          }),
        });
        const livePage = pagesRef.current.find(
          (page) => page.id === activePage.id
        );
        const stale =
          !isExplanatory &&
          Boolean(
            result.contentRevision &&
            isAiBlockResultStale(
              blockSnapshot(editor, blockId),
              livePage?.contentRevision,
              sourceSnapshot,
              result.contentRevision
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
      range?: { from: number; to: number },
      skill?: { pageId: string; scope: "selection" | "block" | "page" }
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
          contentRevision: savedPage.contentRevision,
          from,
          to,
          sources,
          action,
          tone,
          instruction,
        };
        selectionContextRef.current = context;
        const result = await api<SelectionAiResult>(
          skill ? "/api/ai/skills/selection" : "/api/ai/actions",
          {
            method: "POST",
            signal: controller.signal,
            body: JSON.stringify({
              pageId: savedPage.id,
              scope: skill?.scope ?? "selection",
              ...(skill && {
                skillPageId: skill.pageId,
                contextSummary: `Page: ${savedPage.title}; content revision: ${savedPage.contentRevision}; ${sources.length} block segment(s).`,
              }),
              action,
              tone,
              instruction,
              contentRevision: savedPage.contentRevision,
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
          }
        );
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
          livePage?.contentRevision !== result.contentRevision ||
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

  const runPublishedSkill = useCallback(
    (
      skillPageId: string,
      scope: "selection" | "block" | "page",
      range?: { from: number; to: number }
    ) => {
      if (editor && range) editor.commands.setTextSelection(range);
      void runSelectionTransform("custom", undefined, undefined, range, {
        pageId: skillPageId,
        scope,
      });
    },
    [editor, runSelectionTransform]
  );

  const runBlockSkill = useCallback(
    (skillPageId: string, blockId: string) => {
      if (!editor) return;
      const range = editorSkillRange(editor, "block", blockId) ?? undefined;
      if (range) runPublishedSkill(skillPageId, "block", range);
    },
    [editor, runPublishedSkill]
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
        const blockProposals = proposals.filter(isLoadedBlockProposal);
        const blockProposal =
          blockProposals.find((candidate) => candidate.status === "pending") ??
          blockProposals[0];
        const blockTarget = blockProposal
          ? blockProposalTarget(blockProposal.operations)
          : null;
        if (blockProposal && blockTarget) {
          setTransform({
            explanationVi: blockProposal.summaryVi,
            range: { from: 0, to: 0 },
            blockId: blockTarget.blockId,
            proposalId: blockProposal.id,
            baseContentRevision: blockProposal.baseContentRevision,
            operations: blockProposal.operations,
            contentRevision: page.contentRevision,
            snapshot: blockTarget.expectedText,
            stale:
              blockProposal.status === "stale" ||
              blockSnapshot(editor, blockTarget.blockId) !==
                blockTarget.expectedText,
            action: blockProposal.action,
          });
        }
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
            contentRevision: page.contentRevision,
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
          contentRevision: page.contentRevision,
          from,
          to,
          sources,
          action: proposal.action,
          result: {
            proposalId: proposal.id,
            baseContentRevision: proposal.baseContentRevision,
            contentRevision: page.contentRevision,
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
      livePage?.contentRevision !== context.contentRevision ||
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
  const compatibleSlashSkills = menuSkills.filter((skill) => {
    if (!editor || skill.policy.inputScope === "page") return true;
    if (skill.policy.inputScope === "selection")
      return (
        !editor.state.selection.empty && selectionSegments(editor).length > 0
      );
    const range = editorSkillRange(editor, "block");
    if (!range) return false;
    const node = editor.state.selection.$from.parent;
    return isSupportedSkillBlock(node);
  });
  const skillCommands: RunnableEditorCommand[] = compatibleSlashSkills.map(
    (skill) => ({
      key: `skill-${skill.pageId}`,
      label: skill.title,
      hint: `Skill · ${skill.policy.inputScope}`,
      icon: <Sparkles className="size-4" />,
      run: () => {
        if (!editor) return;
        const scope = skill.policy.inputScope;
        const range = editorSkillRange(editor, scope) ?? undefined;
        if (!range)
          return setError("Hãy chọn nội dung trước khi chạy Skill này.");
        runPublishedSkill(skill.pageId, scope, range);
      },
    })
  );
  const commands: RunnableEditorCommand[] = [
    ...SLASH_COMMANDS.map((command) => ({
      ...command,
      run: commandRunners[command.key],
    })),
    ...skillCommands,
  ];
  const visibleSlashCommands = filterSlashCommands(commands, slash.query);
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
      const result = await api<{ pages: PageRow[]; skills: SkillRow[] }>(
        "/api/pages"
      );
      const page = result.pages.find((candidate) => candidate.id === id);
      if (!page) throw new Error("Không tìm thấy trang.");
      updatePage(page);
      setSkillsByPageId(
        Object.fromEntries(result.skills.map((skill) => [skill.pageId, skill]))
      );
      return page;
    },
    [updatePage]
  );

  async function addPage(markAsSkill: boolean) {
    try {
      await flushEditor();
      const result = await api<{ page: PageRow; skill?: SkillRow }>(
        "/api/pages",
        {
          method: "POST",
          body: JSON.stringify({
            title: markAsSkill ? "Skill mới" : "Trang mới",
            markAsSkill,
          }),
        }
      );
      pagesRef.current = [...pagesRef.current, result.page];
      setPageList(pagesRef.current);
      if (result.skill)
        setSkillsByPageId((current) => ({
          ...current,
          [result.skill!.pageId]: result.skill!,
        }));
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
      setSkillsByPageId((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([pageId]) => !deleted.has(pageId))
        )
      );
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

  async function markPageAsSkill(pageId: string) {
    try {
      const result = await api<{ skill: SkillRow }>(
        `/api/pages/${pageId}/skill`,
        {
          method: "POST",
          body: JSON.stringify({}),
        }
      );
      setSkillsByPageId((current) => ({
        ...current,
        [pageId]: result.skill,
      }));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Không thể đánh dấu Skill."
      );
    }
  }

  async function updateActiveSkill(
    patch: Partial<
      Pick<
        SkillRow,
        | "inputScope"
        | "outputMode"
        | "status"
        | "allowedTools"
        | "approvalPolicy"
        | "showInEditorMenu"
      >
    >
  ) {
    if (!activeSkill) return;
    try {
      const result = await api<{ skill: SkillRow }>(
        `/api/pages/${activeSkill.pageId}/skill`,
        { method: "PATCH", body: JSON.stringify(patch) }
      );
      setSkillsByPageId((current) => ({
        ...current,
        [result.skill.pageId]: result.skill,
      }));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Không thể cập nhật Skill."
      );
    }
  }

  async function publishActiveSkill() {
    if (!activeSkill) return;
    try {
      await flushEditor();
      const result = await api<{
        skill: SkillRow;
        version: SkillVersionRow;
      }>(`/api/pages/${activeSkill.pageId}/skill/versions`, { method: "POST" });
      setSkillsByPageId((current) => ({
        ...current,
        [result.skill.pageId]: result.skill,
      }));
      setActiveSkillVersions((current) => {
        const withoutVersion = current.filter(
          (version) => version.id !== result.version.id
        );
        return [result.version, ...withoutVersion].sort(
          (left, right) => right.version - left.version
        );
      });
      setMenuSkills((current) => [
        ...current.filter((skill) => skill.id !== result.skill.id),
        ...(!result.version.policy.showInEditorMenu ||
        result.version.policy.status === "disabled"
          ? []
          : [
              {
                id: result.skill.id,
                pageId: result.skill.pageId,
                title: activePage.title,
                activeVersionId: result.skill.activeVersionId,
                versionId: result.version.id,
                policy: result.version.policy,
              },
            ]),
      ]);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Không thể xuất bản Skill."
      );
    }
  }

  async function activateSkillVersion(versionId: string) {
    if (!activeSkill) return;
    try {
      const result = await api<{ skill: SkillRow }>(
        `/api/pages/${activeSkill.pageId}/skill/versions/${versionId}/activate`,
        { method: "POST" }
      );
      setSkillsByPageId((current) => ({
        ...current,
        [result.skill.pageId]: result.skill,
      }));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Không thể khôi phục Skill."
      );
    }
  }

  async function unmarkPageAsSkill(pageId: string) {
    try {
      await api(`/api/pages/${pageId}/skill`, { method: "DELETE" });
      setSkillsByPageId((current) =>
        Object.fromEntries(
          Object.entries(current).filter(
            ([currentPageId]) => currentPageId !== pageId
          )
        )
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Không thể bỏ đánh dấu Skill."
      );
    }
  }

  async function handleFinding(
    finding: Finding,
    action: "apply" | "dismiss" | "save"
  ) {
    try {
      const currentPage = action === "apply" ? await flushEditor() : undefined;
      if (action === "apply" && (!editor || !currentPage)) return;
      if (action === "apply") editor!.setEditable(false);
      const result = await api<{
        page?: PageRow;
        proposal?: { operations: DocumentOperationBatch };
        findings?: Array<{ id: string }>;
        findingIds?: string[];
      }>(
        action === "apply"
          ? `/api/document-proposals/${finding.proposalId}/accept`
          : action === "save"
            ? "/api/learning-items"
            : finding.proposalId
              ? `/api/document-proposals/${finding.proposalId}/reject`
              : `/api/review-findings/${finding.id}/dismissal`,
        {
          method: "POST",
          ...(action === "save"
            ? { body: JSON.stringify({ findingId: finding.id }) }
            : {}),
        }
      );
      if (action === "apply" && editor) {
        if (!result.page || !result.proposal)
          throw new Error("Máy chủ không trả về đề xuất canonical.");
        try {
          ignoreCanonicalEditorUpdate.current = true;
          applyDocumentOperationsToEditor(
            editor,
            result.proposal.operations,
            currentPage!.contentRevision,
            "server-canonical-proposal"
          );
          updatePage(result.page, "full");
          editor.commands.focus();
        } catch {
          ignoreCanonicalEditorUpdate.current = false;
          editor.commands.setContent(result.page.content as JSONContent, {
            emitUpdate: false,
          });
          updatePage(result.page, "full");
          setError("Đã tải lại nội dung canonical từ máy chủ.");
        }
      }
      const decidedFindingIds = new Set([
        finding.id,
        ...(result.findings?.map((item) => item.id) ?? []),
        ...(result.findingIds ?? []),
      ]);
      setFindings((current) =>
        current.filter((item) => !decidedFindingIds.has(item.id))
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Không thể xử lý góp ý."
      );
    } finally {
      if (action === "apply" && editor) editor.setEditable(true);
    }
  }
  async function applyTransform(action: "accept" | "reject") {
    if (!editor || !transform?.proposalId || !transform.operations) return;
    if (action === "reject") {
      try {
        await api(`/api/document-proposals/${transform.proposalId}/reject`, {
          method: "POST",
        });
        setTransform(null);
        setProposalReloadKey((value) => value + 1);
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Không thể bỏ đề xuất."
        );
      }
      return;
    }
    try {
      const currentPage = await flushEditor();
      if (!currentPage) return;
      if (
        currentPage.contentRevision !== transform.baseContentRevision ||
        !transform.snapshot ||
        !transform.blockId ||
        blockSnapshot(editor, transform.blockId) !== transform.snapshot
      ) {
        setTransform({ ...transform, stale: true });
        return;
      }
      editor.setEditable(false);
      const accepted = await api<{
        page?: PageRow;
        proposal?: { operations: DocumentOperationBatch };
      }>(`/api/document-proposals/${transform.proposalId}/accept`, {
        method: "POST",
      });
      if (!accepted.page || !accepted.proposal)
        throw new Error("Máy chủ không trả về đề xuất canonical.");
      try {
        ignoreCanonicalEditorUpdate.current = true;
        applyDocumentOperationsToEditor(
          editor,
          accepted.proposal.operations,
          currentPage.contentRevision,
          "server-canonical-proposal"
        );
        updatePage(accepted.page, "full");
        editor.commands.focus();
      } catch {
        ignoreCanonicalEditorUpdate.current = false;
        editor.commands.setContent(accepted.page.content as JSONContent, {
          emitUpdate: false,
        });
        updatePage(accepted.page, "full");
        setError("Đã tải lại nội dung canonical từ máy chủ.");
      }
      setTransform(null);
      setProposalReloadKey((value) => value + 1);
    } catch (cause) {
      if (
        cause instanceof Error &&
        "code" in cause &&
        (cause.code === "STALE_PROPOSAL" ||
          cause.code === "CONTENT_REVISION_CONFLICT")
      ) {
        setTransform({ ...transform, stale: true });
      }
      setError(
        cause instanceof Error ? cause.message : "Không thể áp dụng đề xuất."
      );
    } finally {
      editor.setEditable(true);
    }
  }

  function regenerateBlockTransform() {
    if (
      !transform?.blockId ||
      !transform.action ||
      !isBlockAiAction(transform.action)
    ) {
      setError("Không thể tạo lại đề xuất này.");
      return;
    }
    const behavior =
      transform.operations?.operations[0]?.type === "insert-blocks-after"
        ? "insert"
        : "replace";
    setTransform(null);
    void runTransform(transform.action, transform.blockId, behavior);
  }

  return (
    <SidebarProvider defaultOpen={defaultSidebarOpen}>
      <WorkspaceSidebar
        activeId={activeId}
        pages={pageList}
        skillsByPageId={skillsByPageId}
        user={user}
        onAddPage={addPage}
        onDeletePage={deletePage}
        onMovePage={movePage}
        onPractice={() => setView("practice")}
        onRenamePage={renamePage}
        onSelectPage={selectPage}
        onMarkSkill={markPageAsSkill}
        onUnmarkSkill={unmarkPageAsSkill}
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
              {menuSkills.some(
                (skill) => skill.policy.inputScope === "page"
              ) && (
                <div
                  className="mx-auto mb-3 flex w-full max-w-3xl flex-wrap gap-2"
                  aria-label="Page Skills"
                >
                  {menuSkills
                    .filter((skill) => skill.policy.inputScope === "page")
                    .map((skill) => (
                      <Button
                        key={skill.pageId}
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          editor &&
                          runPublishedSkill(
                            skill.pageId,
                            "page",
                            editorSkillRange(editor, "page") ?? undefined
                          )
                        }
                      >
                        <Sparkles data-icon="inline-start" />
                        {skill.title}
                      </Button>
                    ))}
                </div>
              )}
              {activeSkill ? (
                <section
                  className="mx-auto mb-4 flex w-full max-w-3xl flex-wrap items-center gap-3 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm dark:border-violet-900 dark:bg-violet-950"
                  aria-label="Cài đặt Skill"
                >
                  <span className="flex items-center gap-1 font-medium text-violet-800 dark:text-violet-200">
                    <Sparkles className="size-4" /> Skill:{" "}
                    {activeSkill.status === "draft" ? "Bản nháp" : "Đã tắt"}
                    {activeSkill.activeVersionId && " · Đã xuất bản"}
                  </span>
                  <label>
                    Phạm vi{" "}
                    <select
                      aria-label="Phạm vi đầu vào Skill"
                      value={activeSkill.inputScope}
                      onChange={(event) =>
                        void updateActiveSkill({
                          inputScope: event.target
                            .value as SkillRow["inputScope"],
                        })
                      }
                    >
                      <option value="selection">Đoạn chọn</option>
                      <option value="block">Block</option>
                      <option value="page">Trang</option>
                    </select>
                  </label>
                  <label>
                    Đầu ra{" "}
                    <select
                      aria-label="Chế độ đầu ra Skill"
                      value={activeSkill.outputMode}
                      onChange={(event) =>
                        void updateActiveSkill({
                          outputMode: event.target
                            .value as SkillRow["outputMode"],
                        })
                      }
                    >
                      <option value="proposal">Đề xuất chỉnh sửa</option>
                      <option value="read_only">Chỉ đọc</option>
                    </select>
                  </label>
                  <label>
                    Trạng thái{" "}
                    <select
                      aria-label="Trạng thái Skill"
                      value={activeSkill.status}
                      onChange={(event) =>
                        void updateActiveSkill({
                          status: event.target.value as SkillRow["status"],
                        })
                      }
                    >
                      <option value="draft">Bản nháp</option>
                      <option value="disabled">Đã tắt</option>
                    </select>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={activeSkill.showInEditorMenu}
                      onChange={(event) =>
                        void updateActiveSkill({
                          showInEditorMenu: event.target.checked,
                        })
                      }
                    />{" "}
                    Hiện trong menu editor
                  </label>
                  <span>Phê duyệt: bắt buộc</span>
                  <label className="min-w-48 flex-1">
                    Công cụ được phép{" "}
                    <input
                      aria-label="Công cụ được phép"
                      className="w-full rounded border bg-background px-2 py-1"
                      defaultValue={activeSkill.allowedTools.join(", ")}
                      onBlur={(event) =>
                        void updateActiveSkill({
                          allowedTools: event.target.value
                            .split(",")
                            .map((tool) => tool.trim())
                            .filter(Boolean),
                        })
                      }
                    />
                  </label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void publishActiveSkill()}
                  >
                    Xuất bản bản nháp
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void unmarkPageAsSkill(activePage.id)}
                  >
                    Bỏ Skill
                  </Button>
                  {activeSkillVersions.length > 0 && (
                    <div
                      className="w-full border-t border-violet-200 pt-2 dark:border-violet-800"
                      aria-label="Lịch sử phiên bản Skill"
                    >
                      <span className="font-medium">Lịch sử phiên bản</span>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {activeSkillVersions.map((version) => {
                          const isActive =
                            version.id === activeSkill.activeVersionId;
                          return (
                            <span
                              key={version.id}
                              className="rounded border border-violet-200 px-2 py-1 dark:border-violet-800"
                            >
                              V{version.version} ·{" "}
                              {new Date(version.publishedAt).toLocaleString(
                                "vi-VN"
                              )}
                              {isActive ? " · Đang hoạt động" : ""}
                              {!isActive && (
                                <button
                                  type="button"
                                  className="ml-2 underline"
                                  onClick={() =>
                                    void activateSkillVersion(version.id)
                                  }
                                >
                                  Khôi phục
                                </button>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </section>
              ) : (
                <div className="mx-auto mb-4 w-full max-w-3xl">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void markPageAsSkill(activePage.id)}
                  >
                    <Sparkles data-icon="inline-start" /> Đánh dấu là Skill
                  </Button>
                </div>
              )}
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
                      skills={menuSkills.filter(
                        (skill) => skill.policy.inputScope === "selection"
                      )}
                      onRunSkill={(pageId, range) =>
                        runPublishedSkill(pageId, "selection", range)
                      }
                    />
                    <BlockControls
                      editor={editor}
                      pageId={activePage.id}
                      onAskAI={runTransform}
                      skills={menuSkills.filter(
                        (skill) => skill.policy.inputScope === "block"
                      )}
                      onRunSkill={runBlockSkill}
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
              onRegenerateTransform={regenerateBlockTransform}
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
