"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import DragHandle from "@tiptap/extension-drag-handle-react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import {
  AlignLeft,
  ArrowDown,
  ArrowUp,
  Bot,
  CheckSquare,
  ChevronRight,
  Circle,
  Clipboard,
  Code,
  Copy,
  GripVertical,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Paintbrush,
  Plus,
  Quote,
  Sparkles,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  blockText,
  isSupportedSkillBlock,
  deleteBlock,
  duplicateBlock,
  insertParagraphAfter,
  moveBlock,
  moveBlockRelative,
  normalizeBlockTarget,
  setBlockAppearance,
  turnBlockInto,
  type BlockKind,
  type BlockTarget,
} from "./block-utils";

type AiAction =
  | "improve"
  | "natural"
  | "rewrite"
  | "shorten"
  | "expand"
  | "explain"
  | "phrase";
type BlockAiBehavior = "replace" | "insert";

const blockKinds: Array<{
  kind: BlockKind;
  label: string;
  icon: React.ReactNode;
}> = [
  { kind: "paragraph", label: "Text", icon: <AlignLeft /> },
  { kind: "heading1", label: "Heading 1", icon: <Heading1 /> },
  { kind: "heading2", label: "Heading 2", icon: <Heading2 /> },
  { kind: "heading3", label: "Heading 3", icon: <Heading3 /> },
  { kind: "bulletList", label: "Bulleted list", icon: <List /> },
  { kind: "orderedList", label: "Numbered list", icon: <ListOrdered /> },
  { kind: "taskList", label: "To-do", icon: <CheckSquare /> },
  { kind: "blockquote", label: "Quote", icon: <Quote /> },
  { kind: "codeBlock", label: "Code", icon: <Code /> },
];

const aiActions: Array<{ action: AiAction; label: string }> = [
  { action: "improve", label: "Improve writing" },
  { action: "natural", label: "Make natural" },
  { action: "rewrite", label: "Rewrite" },
  { action: "shorten", label: "Shorten" },
  { action: "expand", label: "Expand" },
  { action: "explain", label: "Explain" },
  { action: "phrase", label: "Suggest phrases" },
];

const colors = [
  { label: "Default", value: null, swatch: "#1f2923" },
  { label: "Gray", value: "gray", swatch: "#6b7280" },
  { label: "Brown", value: "brown", swatch: "#8a5a44" },
  { label: "Orange", value: "orange", swatch: "#b45309" },
  { label: "Green", value: "green", swatch: "#2f6b4f" },
  { label: "Blue", value: "blue", swatch: "#2563a8" },
  { label: "Purple", value: "purple", swatch: "#7c3f98" },
];

function lock(editor: Editor, value: boolean) {
  editor.view.dispatch(
    editor.state.tr
      .setMeta("lockDragHandle", value)
      .setMeta("addToHistory", false)
  );
}

function restoreEditorFocus(editor: Editor) {
  requestAnimationFrame(() => {
    if (!editor.isDestroyed) editor.commands.focus();
  });
}

export function BlockControls({
  editor,
  pageId,
  onAskAI,
  skills = [],
  onRunSkill,
}: {
  editor: Editor;
  pageId: string;
  onAskAI(action: AiAction, blockId: string, behavior: BlockAiBehavior): void;
  skills?: Array<{ pageId: string; title: string }>;
  onRunSkill?(pageId: string, blockId: string): void;
}) {
  const [target, setTarget] = useState<BlockTarget | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTargetId, setPickerTargetId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [touchDrag, setTouchDrag] = useState<{
    active: boolean;
    x: number;
    y: number;
  } | null>(null);
  const touchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchActive = useRef(false);
  const touchSourceId = useRef<string | null>(null);
  const pointerMoved = useRef(false);
  const suppressMenu = useRef(false);
  const pointerStart = useRef({ x: 0, y: 0 });
  const menuOpenRef = useRef(false);
  const pickerOpenRef = useRef(false);

  useEffect(() => {
    menuOpenRef.current = menuOpen;
  }, [menuOpen]);
  useEffect(() => {
    pickerOpenRef.current = pickerOpen;
  }, [pickerOpen]);

  const onNodeChange = useCallback(
    ({ node, pos }: { node: ProseMirrorNode | null; pos: number }) => {
      if (!node) {
        if (!menuOpenRef.current && !pickerOpenRef.current) setTarget(null);
        return;
      }
      const next = normalizeBlockTarget(editor, node, pos);
      if (next) setTarget(next);
    },
    [editor]
  );

  function closePicker() {
    setPickerOpen(false);
    setPickerTargetId(null);
    lock(editor, menuOpen);
    restoreEditorFocus(editor);
  }

  function handlePickerOpenChange(open: boolean) {
    if (!open) {
      closePicker();
      return;
    }
    if (!target || pickerOpen) return;
    setPickerTargetId(target.id);
    lock(editor, true);
    requestAnimationFrame(() => setPickerOpen(true));
  }

  function chooseBlock(kind: BlockKind) {
    if (target) {
      const insertedId = insertParagraphAfter(editor, target);
      if (insertedId) turnBlockInto(editor, insertedId, kind);
    }
    closePicker();
  }

  function handleMenuOpenChange(open: boolean) {
    if (open && suppressMenu.current) return;
    setMenuOpen(open);
    lock(editor, open || pickerOpen || deleteOpen);
    if (!open) restoreEditorFocus(editor);
  }

  async function copyLink() {
    if (!target) return;
    const url = `${window.location.origin}/workspace?page=${pageId}#block=${target.id}`;
    await navigator.clipboard.writeText(url);
    toast.success("Đã sao chép liên kết block");
  }

  function suppressNextMenuOpen() {
    suppressMenu.current = true;
    window.setTimeout(() => {
      suppressMenu.current = false;
    }, 0);
  }

  function pointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (!target) return;
    pointerMoved.current = false;
    touchSourceId.current = target.id;
    pointerStart.current = { x: event.clientX, y: event.clientY };
    if (event.pointerType === "mouse") return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* A cancelled pointer may not be capturable. */
    }
    touchTimer.current = setTimeout(() => {
      touchActive.current = true;
      suppressMenu.current = true;
      lock(editor, true);
      setTouchDrag({ active: true, x: event.clientX, y: event.clientY });
      navigator.vibrate?.(20);
    }, 180);
  }

  function pointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    const distance = Math.hypot(
      event.clientX - pointerStart.current.x,
      event.clientY - pointerStart.current.y
    );
    if (distance > 8) pointerMoved.current = true;
    if (event.pointerType === "mouse") return;
    if (!touchActive.current) {
      if (touchTimer.current && distance > 8) {
        clearTimeout(touchTimer.current);
        touchTimer.current = null;
      }
      return;
    }
    event.preventDefault();
    setTouchDrag({ active: true, x: event.clientX, y: event.clientY });
    if (event.clientY < 70) window.scrollBy({ top: -16 });
    else if (event.clientY > window.innerHeight - 70)
      window.scrollBy({ top: 16 });
  }

  function pointerEnd(event: React.PointerEvent<HTMLButtonElement>) {
    if (touchTimer.current) clearTimeout(touchTimer.current);
    if (touchActive.current && touchSourceId.current) {
      const element = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>("[data-blockid]");
      const targetId = element?.getAttribute("data-blockid");
      if (targetId && element) {
        const rect = element.getBoundingClientRect();
        if (
          !moveBlockRelative(
            editor,
            touchSourceId.current,
            targetId,
            event.clientY > rect.top + rect.height / 2
          )
        ) {
          toast.error("Không thể thả block vào vị trí này");
        }
      }
    }
    if (pointerMoved.current || touchActive.current) suppressNextMenuOpen();
    touchActive.current = false;
    touchSourceId.current = null;
    setTouchDrag(null);
    lock(editor, menuOpen || pickerOpen || deleteOpen);
  }

  function preventMenuAfterDrag(event: React.MouseEvent<HTMLButtonElement>) {
    if (!suppressMenu.current && !pointerMoved.current) return;
    event.preventDefault();
    event.stopPropagation();
    pointerMoved.current = false;
  }

  return (
    <>
      <DragHandle
        editor={editor}
        nested
        onNodeChange={onNodeChange}
        className="notion-block-handle"
      >
        <div className="notion-block-controls" data-testid="block-controls">
          <Popover open={pickerOpen} onOpenChange={handlePickerOpenChange}>
            <PopoverTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Thêm block bên dưới"
                />
              }
            >
              <Plus data-icon="inline-start" />
            </PopoverTrigger>
            <PopoverContent side="right" align="start" className="w-80 p-0">
              <Command>
                <CommandInput autoFocus placeholder="Tìm loại block…" />
                <CommandList>
                  <CommandEmpty>Không tìm thấy block.</CommandEmpty>
                  <CommandGroup heading="Basic blocks">
                    {blockKinds.map((item) => (
                      <CommandItem
                        key={item.kind}
                        onSelect={() => chooseBlock(item.kind)}
                      >
                        {item.icon}
                        <span>{item.label}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                  <CommandSeparator />
                  <CommandGroup heading="AI">
                    <CommandItem
                      onSelect={() => {
                        if (pickerTargetId)
                          onAskAI("improve", pickerTargetId, "insert");
                        closePicker();
                      }}
                    >
                      <Sparkles /> Ask AI
                    </CommandItem>
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          <DropdownMenu open={menuOpen} onOpenChange={handleMenuOpenChange}>
            <Tooltip>
              <TooltipTrigger
                render={
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon"
                        className="notion-grip"
                        aria-label="Kéo block hoặc mở tùy chọn"
                        onPointerDown={pointerDown}
                        onPointerMove={pointerMove}
                        onPointerUp={pointerEnd}
                        onPointerCancel={pointerEnd}
                        onClickCapture={preventMenuAfterDrag}
                        onDragStart={() => {
                          pointerMoved.current = true;
                          suppressMenu.current = true;
                        }}
                        onDragEnd={suppressNextMenuOpen}
                      />
                    }
                  />
                }
              >
                <GripVertical data-icon="inline-start" />
              </TooltipTrigger>
              <TooltipContent side="top">
                Kéo để di chuyển · Nhấp để mở menu
              </TooltipContent>
            </Tooltip>

            <DropdownMenuContent side="right" align="start">
              <DropdownMenuGroup>
                <DropdownMenuLabel>
                  {target ? `${target.node.type.name} block` : "Block"}
                </DropdownMenuLabel>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <ChevronRight /> Turn into
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuGroup>
                      {blockKinds.map((item) => (
                        <DropdownMenuItem
                          key={item.kind}
                          onClick={() =>
                            target &&
                            turnBlockInto(editor, target.id, item.kind)
                          }
                        >
                          {item.icon}
                          {item.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                {skills.length > 0 &&
                  target &&
                  isSupportedSkillBlock(target.node) && (
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <Sparkles /> Skills
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        {skills.map((skill) => (
                          <DropdownMenuItem
                            key={skill.pageId}
                            onClick={() =>
                              target && onRunSkill?.(skill.pageId, target.id)
                            }
                          >
                            <Sparkles />
                            {skill.title}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  )}
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Bot /> Ask AI
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuGroup>
                      {aiActions.map((item) =>
                        item.action === "explain" ||
                        item.action === "phrase" ? (
                          <DropdownMenuItem
                            key={item.action}
                            onClick={() =>
                              target &&
                              onAskAI(item.action, target.id, "replace")
                            }
                          >
                            <WandSparkles />
                            {item.label}
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuSub key={item.action}>
                            <DropdownMenuSubTrigger>
                              <WandSparkles />
                              {item.label}
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent>
                              <DropdownMenuItem
                                onClick={() =>
                                  target &&
                                  onAskAI(item.action, target.id, "replace")
                                }
                              >
                                Replace block
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  target &&
                                  onAskAI(item.action, target.id, "insert")
                                }
                              >
                                Insert below
                              </DropdownMenuItem>
                            </DropdownMenuSubContent>
                          </DropdownMenuSub>
                        )
                      )}
                    </DropdownMenuGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Paintbrush /> Color
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>Text</DropdownMenuLabel>
                      {colors.map((color) => (
                        <DropdownMenuItem
                          key={`text-${color.label}`}
                          onClick={() =>
                            target &&
                            setBlockAppearance(
                              editor,
                              target.id,
                              color.value,
                              target.node.attrs.blockBackground
                            )
                          }
                        >
                          <Circle fill={color.swatch} color={color.swatch} />
                          {color.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>Background</DropdownMenuLabel>
                      {colors.map((color) => (
                        <DropdownMenuItem
                          key={`bg-${color.label}`}
                          onClick={() =>
                            target &&
                            setBlockAppearance(
                              editor,
                              target.id,
                              target.node.attrs.blockColor,
                              color.value
                            )
                          }
                        >
                          <span
                            className="size-4 rounded-sm"
                            style={{ background: color.swatch, opacity: 0.28 }}
                          />
                          {color.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  onClick={() => target && duplicateBlock(editor, target.id)}
                >
                  <Copy /> Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem onClick={copyLink}>
                  <Clipboard /> Copy block link
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => target && moveBlock(editor, target.id, "up")}
                >
                  <ArrowUp /> Move up
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => target && moveBlock(editor, target.id, "down")}
                >
                  <ArrowDown /> Move down
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => {
                    if (!target) return;
                    if (blockText(target.node)) setDeleteOpen(true);
                    else deleteBlock(editor, target.id);
                  }}
                >
                  <Trash2 /> Delete
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </DragHandle>

      {touchDrag?.active && (
        <div
          className="touch-drag-preview"
          style={{ left: touchDrag.x + 14, top: touchDrag.y + 14 }}
        >
          <GripVertical className="size-4" /> Moving block
        </div>
      )}

      <AlertDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          lock(editor, open || menuOpen || pickerOpen);
          if (!open) restoreEditorFocus(editor);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa block này?</AlertDialogTitle>
            <AlertDialogDescription>
              Nội dung trong block sẽ bị xóa. Bạn có thể dùng Undo ngay sau đó
              để khôi phục.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (target) deleteBlock(editor, target.id);
                setDeleteOpen(false);
                lock(editor, false);
              }}
            >
              Xóa block
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export type { AiAction, BlockAiBehavior };
