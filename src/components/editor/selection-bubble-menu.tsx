"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { BubbleMenu } from "@tiptap/react/menus";
import { TextSelection } from "@tiptap/pm/state";
import {
  Baseline,
  Bold,
  Check,
  ChevronDown,
  Code2,
  Highlighter,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Loader2,
  MessageSquareText,
  Pilcrow,
  Quote,
  Sparkles,
  Strikethrough,
  Underline as UnderlineIcon,
  WandSparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  InputGroup,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { rememberEditorSelection } from "./selection-ai";
import {
  createSelectionVirtualElement,
  measureSelectionReference,
} from "./selection-anchor";

const SELECTION_BUBBLE_KEY = "selectionBubbleMenu";

export type SelectionAiAction =
  | "improve"
  | "natural"
  | "rewrite"
  | "shorten"
  | "expand"
  | "explain"
  | "phrase"
  | "custom";
export type SelectionTone = "natural" | "concise" | "formal" | "friendly";
export type SelectionBubbleState = {
  mode: "idle" | "loading" | "preview" | "no-change" | "stale";
  summary?: string;
};

type Props = {
  editor: Editor;
  state: SelectionBubbleState;
  onRequest: (
    action: SelectionAiAction,
    tone?: SelectionTone,
    instruction?: string,
    range?: { from: number; to: number }
  ) => void;
  onAccept: () => void;
  onReject: () => void;
  onAbort: () => void;
  onRegenerate: () => void;
};

const textColors = [
  ["Mặc định", null],
  ["Xám", "var(--editor-text-gray)"],
  ["Đỏ", "var(--editor-text-red)"],
  ["Cam", "var(--editor-text-orange)"],
  ["Xanh lá", "var(--editor-text-green)"],
  ["Xanh dương", "var(--editor-text-blue)"],
  ["Tím", "var(--editor-text-purple)"],
] as const;
const highlights = [
  ["Không nền", null],
  ["Xám", "var(--editor-highlight-gray)"],
  ["Đỏ", "var(--editor-highlight-red)"],
  ["Vàng", "var(--editor-highlight-yellow)"],
  ["Xanh lá", "var(--editor-highlight-green)"],
  ["Xanh dương", "var(--editor-highlight-blue)"],
  ["Tím", "var(--editor-highlight-purple)"],
] as const;

function FormattingToggle({
  label,
  pressed,
  onPressedChange,
  children,
}: {
  label: string;
  pressed: boolean;
  onPressedChange: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Toggle
            size="default"
            aria-label={label}
            pressed={pressed}
            onPressedChange={onPressedChange}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function turnInto(editor: Editor, kind: string) {
  const chain = editor.chain().focus();
  if (kind === "text") chain.setParagraph().run();
  else if (kind.startsWith("h"))
    chain.setHeading({ level: Number(kind.slice(1)) as 1 | 2 | 3 }).run();
  else if (kind === "bullet") chain.toggleBulletList().run();
  else if (kind === "number") chain.toggleOrderedList().run();
  else if (kind === "task") chain.toggleTaskList().run();
  else if (kind === "quote") chain.toggleBlockquote().run();
  else if (kind === "code") chain.toggleCodeBlock().run();
}

export function SelectionBubbleMenu({
  editor,
  state,
  onRequest,
  onAccept,
  onReject,
  onAbort,
  onRegenerate,
}: Props) {
  const [customMode, setCustomMode] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const [href, setHref] = useState("");
  const preservedSelection = useRef<{ from: number; to: number } | null>(null);
  const bubbleElement = useRef<HTMLDivElement | null>(null);
  const busy = state.mode !== "idle";

  const appendToBody = useCallback(() => document.body, []);
  const getSelectionReference = useCallback(
    () => createSelectionVirtualElement(editor),
    [editor]
  );
  const shouldShow = useCallback(
    ({
      editor: current,
      state: editorState,
      from,
      to,
    }: Parameters<
      NonNullable<React.ComponentProps<typeof BubbleMenu>["shouldShow"]>
    >[0]) => {
      const visible =
        current.isEditable &&
        editorState.selection instanceof TextSelection &&
        !editorState.selection.empty &&
        Boolean(editorState.doc.textBetween(from, to, " ").trim()) &&
        !current.isActive("codeBlock") &&
        Boolean(measureSelectionReference(current));
      if (visible) {
        preservedSelection.current = { from, to };
        rememberEditorSelection(current, { from, to });
      }
      return visible;
    },
    []
  );
  const floatingOptions = useMemo(
    () => ({
      placement: "top" as const,
      offset: 8,
      inline: true,
      flip: { fallbackPlacements: ["bottom" as const] },
      shift: { padding: 8, crossAxis: true },
      hide: { strategy: "referenceHidden" as const },
      strategy: "fixed" as const,
    }),
    []
  );

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (customMode) {
        event.preventDefault();
        setCustomMode(false);
        return;
      }
      if (state.mode === "loading") onAbort();
      else if (
        state.mode === "preview" ||
        state.mode === "stale" ||
        state.mode === "no-change"
      )
        onReject();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [customMode, onAbort, onReject, state.mode]);

  useEffect(() => {
    const element = bubbleElement.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!editor.isDestroyed)
          editor.view.dispatch(
            editor.state.tr.setMeta(SELECTION_BUBBLE_KEY, "updatePosition")
          );
      });
    });
    observer.observe(element);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [editor]);

  function submitLink() {
    const value = href.trim();
    if (!value)
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    else if (/^(https?:|mailto:)/i.test(value))
      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({ href: value })
        .run();
    else return;
    setLinkOpen(false);
  }

  function sendAi(
    action: SelectionAiAction,
    tone?: SelectionTone,
    instruction?: string
  ) {
    setCustomMode(false);
    const range = editor.state.selection.empty
      ? (preservedSelection.current ?? undefined)
      : { from: editor.state.selection.from, to: editor.state.selection.to };
    if (range) editor.commands.setTextSelection(range);
    onRequest(action, tone, instruction, range);
  }

  function rememberSelection() {
    const { from, to, empty } = editor.state.selection;
    if (!empty) {
      preservedSelection.current = { from, to };
      rememberEditorSelection(editor, { from, to });
    }
  }

  return (
    <BubbleMenu
      ref={bubbleElement}
      editor={editor}
      pluginKey={SELECTION_BUBBLE_KEY}
      updateDelay={0}
      resizeDelay={16}
      appendTo={appendToBody}
      getReferencedVirtualElement={getSelectionReference}
      shouldShow={shouldShow}
      options={floatingOptions}
      className="selection-bubble-menu"
      data-testid="selection-bubble-menu"
      onPointerDownCapture={rememberSelection}
    >
      {state.mode === "loading" ? (
        <div className="selection-ai-status">
          <Loader2 className="animate-spin" />
          <span>Đang sửa đoạn đã chọn…</span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Dừng AI"
            onClick={onAbort}
          >
            <X />
          </Button>
        </div>
      ) : state.mode === "preview" ? (
        <div className="selection-ai-status">
          <Sparkles />
          <span>
            {state.summary ?? "Xem lại thay đổi ngay trong đoạn viết."}
          </span>
          <Button variant="ghost" size="sm" onClick={onReject}>
            <X data-icon="inline-start" />
            Bỏ
          </Button>
          <Button size="sm" onClick={onAccept}>
            <Check data-icon="inline-start" />
            Chấp nhận
          </Button>
        </div>
      ) : state.mode === "no-change" ? (
        <div className="selection-ai-status">
          <Check />
          <span>{state.summary ?? "Đoạn này đã ổn."}</span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Đóng"
            onClick={onReject}
          >
            <X />
          </Button>
        </div>
      ) : state.mode === "stale" ? (
        <div className="selection-ai-status text-destructive">
          <X />
          <span>
            Nội dung đã thay đổi. Hãy tạo lại đề xuất trên đoạn hiện tại.
          </span>
          <Button variant="ghost" size="sm" onClick={onReject}>
            Đóng
          </Button>
          <Button size="sm" onClick={onRegenerate}>
            <Sparkles data-icon="inline-start" />
            Tạo lại
          </Button>
        </div>
      ) : customMode ? (
        <InputGroup className="selection-custom-prompt">
          <InputGroupInput
            autoFocus
            maxLength={800}
            value={customPrompt}
            placeholder="Bạn muốn AI sửa thế nào?"
            onChange={(event) => setCustomPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && customPrompt.trim())
                sendAi("custom", undefined, customPrompt.trim());
              if (event.key === "Escape") {
                event.preventDefault();
                setCustomMode(false);
              }
            }}
          />
          <InputGroupButton
            size="icon-sm"
            aria-label="Gửi yêu cầu"
            disabled={!customPrompt.trim()}
            onClick={() => sendAi("custom", undefined, customPrompt.trim())}
          >
            <Sparkles />
          </InputGroupButton>
        </InputGroup>
      ) : (
        <div
          className="selection-format-row"
          aria-label="Công cụ cho đoạn được chọn"
        >
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Chuyển loại block"
                />
              }
            >
              <Pilcrow data-icon="inline-start" />
              <ChevronDown data-icon="inline-end" />
            </DropdownMenuTrigger>
            <DropdownMenuContent side="bottom" align="start">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Turn into</DropdownMenuLabel>
                {[
                  ["text", "Văn bản"],
                  ["h1", "Tiêu đề 1"],
                  ["h2", "Tiêu đề 2"],
                  ["h3", "Tiêu đề 3"],
                  ["bullet", "Danh sách bullet"],
                  ["number", "Danh sách số"],
                  ["task", "Danh sách việc"],
                  ["quote", "Trích dẫn"],
                  ["code", "Code"],
                ].map(([kind, label]) => (
                  <DropdownMenuItem
                    key={kind}
                    onClick={() => turnInto(editor, kind)}
                  >
                    {kind === "bullet" ? (
                      <List />
                    ) : kind === "number" ? (
                      <ListOrdered />
                    ) : kind === "task" ? (
                      <ListChecks />
                    ) : kind === "quote" ? (
                      <Quote />
                    ) : kind === "code" ? (
                      <Code2 />
                    ) : (
                      <Pilcrow />
                    )}
                    {label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <FormattingToggle
            label="Đậm"
            pressed={editor.isActive("bold")}
            onPressedChange={() => editor.chain().focus().toggleBold().run()}
          >
            <Bold />
          </FormattingToggle>
          <FormattingToggle
            label="Nghiêng"
            pressed={editor.isActive("italic")}
            onPressedChange={() => editor.chain().focus().toggleItalic().run()}
          >
            <Italic />
          </FormattingToggle>
          <FormattingToggle
            label="Gạch chân"
            pressed={editor.isActive("underline")}
            onPressedChange={() =>
              editor.chain().focus().toggleUnderline().run()
            }
          >
            <UnderlineIcon />
          </FormattingToggle>
          <FormattingToggle
            label="Gạch ngang"
            pressed={editor.isActive("strike")}
            onPressedChange={() => editor.chain().focus().toggleStrike().run()}
          >
            <Strikethrough />
          </FormattingToggle>
          <FormattingToggle
            label="Inline code"
            pressed={editor.isActive("code")}
            onPressedChange={() => editor.chain().focus().toggleCode().run()}
          >
            <Code2 />
          </FormattingToggle>
          <Popover
            open={linkOpen}
            onOpenChange={(open) => {
              setLinkOpen(open);
              if (open) setHref(editor.getAttributes("link").href ?? "");
            }}
          >
            <PopoverTrigger
              render={
                <Button
                  variant={editor.isActive("link") ? "secondary" : "ghost"}
                  size="icon"
                  aria-label="Liên kết"
                />
              }
            >
              <Link2 />
            </PopoverTrigger>
            <PopoverContent side="bottom" align="center" className="w-72">
              <InputGroup>
                <InputGroupInput
                  autoFocus
                  value={href}
                  placeholder="https:// hoặc mailto:"
                  onChange={(event) => setHref(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") submitLink();
                  }}
                />
                <InputGroupButton onClick={submitLink}>Lưu</InputGroupButton>
              </InputGroup>
              {href && !/^(https?:|mailto:)/i.test(href) && (
                <p className="text-destructive">
                  Chỉ hỗ trợ http, https hoặc mailto.
                </p>
              )}
            </PopoverContent>
          </Popover>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon" aria-label="Màu chữ" />
              }
            >
              <Baseline />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuGroup>
                <DropdownMenuLabel>Màu chữ</DropdownMenuLabel>
                {textColors.map(([label, value]) => (
                  <DropdownMenuItem
                    key={label}
                    onClick={() =>
                      value
                        ? editor.chain().focus().setColor(value).run()
                        : editor.chain().focus().unsetColor().run()
                    }
                  >
                    <span
                      className="selection-color-dot"
                      style={{ color: value ?? "var(--foreground)" }}
                    >
                      A
                    </span>
                    {label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon" aria-label="Màu nền" />
              }
            >
              <Highlighter />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuGroup>
                <DropdownMenuLabel>Màu nền</DropdownMenuLabel>
                {highlights.map(([label, value]) => (
                  <DropdownMenuItem
                    key={label}
                    onClick={() =>
                      value
                        ? editor
                            .chain()
                            .focus()
                            .setHighlight({ color: value })
                            .run()
                        : editor.chain().focus().unsetHighlight().run()
                    }
                  >
                    <span
                      className="selection-highlight-dot"
                      style={{ background: value ?? "transparent" }}
                    />
                    {label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onPointerDown={rememberSelection}
                />
              }
            >
              <Sparkles data-icon="inline-start" />
              Ask AI
              <ChevronDown data-icon="inline-end" />
            </DropdownMenuTrigger>
            <DropdownMenuContent side="bottom" align="end">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Chỉnh đoạn được chọn</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => sendAi("improve")}>
                  <WandSparkles />
                  Improve writing
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => sendAi("natural")}>
                  <Sparkles />
                  Make natural
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <MessageSquareText />
                    Rewrite
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuGroup>
                      {(
                        [
                          "natural",
                          "concise",
                          "formal",
                          "friendly",
                        ] as SelectionTone[]
                      ).map((tone) => (
                        <DropdownMenuItem
                          key={tone}
                          onClick={() => sendAi("rewrite", tone)}
                        >
                          {tone}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuItem onClick={() => sendAi("shorten")}>
                  Shorten
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => sendAi("expand")}>
                  Expand
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => sendAi("explain")}>
                  Explain
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => sendAi("phrase")}>
                  Suggest phrases
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => setCustomMode(true)}>
                  <Sparkles />
                  Custom prompt…
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </BubbleMenu>
  );
}
