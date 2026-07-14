"use client";

import { useMemo, useState } from "react";
import { signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import {
  BookOpenText,
  ChevronRight,
  ChevronsUpDown,
  Clipboard,
  FilePlus2,
  FileText,
  IndentDecrease,
  IndentIncrease,
  Loader2,
  LogOut,
  Monitor,
  Moon,
  MoreHorizontal,
  MoveDown,
  MoveUp,
  Pencil,
  Plus,
  Sparkles,
  Sun,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type { pages } from "@/db/schema";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
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
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";

type PageRow = typeof pages.$inferSelect;
type PageNode = PageRow & { children: PageNode[] };
type User = { id: string; name?: string | null; email?: string | null; image?: string | null };
type MoveAction = "up" | "down" | "indent" | "outdent";

type Props = {
  activeId: string;
  pages: PageRow[];
  user: User;
  onAddPage: () => void;
  onDeletePage: (pageId: string) => Promise<boolean>;
  onMovePage: (pageId: string, action: MoveAction) => void;
  onPractice: () => void;
  onRenamePage: (pageId: string) => void;
  onSelectPage: (pageId: string) => void;
};

function createsCycle(node: PageNode, parent: PageNode, nodes: Map<string, PageNode>) {
  let cursor: PageNode | undefined = parent;
  const visited = new Set<string>();
  while (cursor && !visited.has(cursor.id)) {
    if (cursor.id === node.id) return true;
    visited.add(cursor.id);
    cursor = cursor.parentId ? nodes.get(cursor.parentId) : undefined;
  }
  return false;
}

export function buildPageTree(pageList: PageRow[]) {
  const nodes = new Map<string, PageNode>(pageList.map((page) => [page.id, { ...page, children: [] as PageNode[] }]));
  const roots: PageNode[] = [];
  for (const page of pageList) {
    const node = nodes.get(page.id)!;
    const parent = page.parentId ? nodes.get(page.parentId) : undefined;
    if (parent && !createsCycle(node, parent, nodes)) parent.children.push(node);
    else roots.push(node);
  }
  const sort = (items: PageNode[]) => {
    items.sort((a, b) => a.position - b.position || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    items.forEach((item) => sort(item.children));
  };
  sort(roots);
  return roots;
}

export function pageSubtreeIds(pageList: PageRow[], pageId: string) {
  const ids = new Set([pageId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const page of pageList) {
      if (page.parentId && ids.has(page.parentId) && !ids.has(page.id)) {
        ids.add(page.id);
        changed = true;
      }
    }
  }
  return [...ids];
}

function userInitials(user: User) {
  const value = user.name?.trim() || user.email?.split("@")[0] || "NN";
  return value.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

type PageItemProps = {
  activeId: string;
  node: PageNode;
  pages: PageRow[];
  onMovePage: (pageId: string, action: MoveAction) => void;
  onRenamePage: (pageId: string) => void;
  onRequestDelete: (pageId: string) => void;
  onSelectPage: (pageId: string) => void;
};

function PageItem({ node, ...props }: PageItemProps) {
  const hasChildren = node.children.length > 0;
  const siblings = props.pages.filter((page) => page.parentId === node.parentId);
  const siblingIndex = siblings.findIndex((page) => page.id === node.id);
  const pageIndex = props.pages.findIndex((page) => page.id === node.id);
  const subtreeCount = pageSubtreeIds(props.pages, node.id).length;

  return (
    <Collapsible defaultOpen className="group/page" render={<SidebarMenuItem />}>
        {hasChildren && (
          <CollapsibleTrigger
            render={<Button className="absolute top-1.5 left-1" variant="ghost" size="icon-xs" aria-label={`Thu gọn ${node.title}`} />}
          >
            <ChevronRight className="transition-transform group-data-[open]/page:rotate-90" />
          </CollapsibleTrigger>
        )}
        <SidebarMenuButton
          className={cn(hasChildren && "pl-7")}
          isActive={node.id === props.activeId}
          onClick={() => props.onSelectPage(node.id)}
        >
          <FileText />
          <span>{node.title}</span>
        </SidebarMenuButton>
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuAction showOnHover aria-label={`Tùy chọn cho ${node.title}`} />}>
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start" className="w-52">
            <DropdownMenuGroup>
              <DropdownMenuLabel>{node.title}</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => props.onRenamePage(node.id)}><Pencil />Đổi tên</DropdownMenuItem>
              <DropdownMenuItem onClick={async () => {
                await navigator.clipboard.writeText(`${window.location.origin}/workspace?page=${node.id}`);
                toast.success("Đã sao chép liên kết trang.");
              }}><Clipboard />Sao chép liên kết</DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem disabled={siblingIndex <= 0} onClick={() => props.onMovePage(node.id, "up")}><MoveUp />Di chuyển lên</DropdownMenuItem>
              <DropdownMenuItem disabled={siblingIndex < 0 || siblingIndex >= siblings.length - 1} onClick={() => props.onMovePage(node.id, "down")}><MoveDown />Di chuyển xuống</DropdownMenuItem>
              <DropdownMenuItem disabled={pageIndex <= 0} onClick={() => props.onMovePage(node.id, "indent")}><IndentIncrease />Lồng vào trang trước</DropdownMenuItem>
              <DropdownMenuItem disabled={!node.parentId} onClick={() => props.onMovePage(node.id, "outdent")}><IndentDecrease />Đưa ra cấp gốc</DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                variant="destructive"
                disabled={subtreeCount >= props.pages.length}
                onClick={() => props.onRequestDelete(node.id)}
              ><Trash2 />Xóa{subtreeCount > 1 ? ` ${subtreeCount} trang` : " trang"}</DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        {hasChildren && (
          <CollapsibleContent>
            <SidebarMenuSub>
              {node.children.map((child) => <PageItem key={child.id} node={child} {...props} />)}
            </SidebarMenuSub>
          </CollapsibleContent>
        )}
    </Collapsible>
  );
}

export function WorkspaceSidebar({ activeId, pages: pageList, user, onAddPage, onDeletePage, onMovePage, onPractice, onRenamePage, onSelectPage }: Props) {
  const { setOpenMobile } = useSidebar();
  const { theme, setTheme } = useTheme();
  const [deleteTarget, setDeleteTarget] = useState<PageRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const tree = useMemo(() => buildPageTree(pageList), [pageList]);
  const deleteCount = deleteTarget ? pageSubtreeIds(pageList, deleteTarget.id).length : 0;

  function selectPage(pageId: string) {
    onSelectPage(pageId);
    setOpenMobile(false);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const deleted = await onDeletePage(deleteTarget.id);
    setDeleting(false);
    if (deleted) setDeleteTarget(null);
  }

  return (
    <>
      <Sidebar collapsible="offcanvas">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" onClick={() => selectPage(activeId)}>
                <span className="sidebar-brand-mark"><BookOpenText /></span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">NativeNote</span>
                  <span className="truncate text-muted-foreground">Workspace cá nhân</span>
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton onClick={() => { onAddPage(); setOpenMobile(false); }}>
                    <FilePlus2 /><span>Trang mới</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton onClick={() => { onPractice(); setOpenMobile(false); }}>
                    <Sparkles /><span>Cần luyện hôm nay</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel>Trang</SidebarGroupLabel>
            <SidebarGroupAction onClick={onAddPage} aria-label="Tạo trang mới"><Plus /><span className="sr-only">Tạo trang mới</span></SidebarGroupAction>
            <SidebarGroupContent>
              <SidebarMenu>
                {tree.map((node) => (
                  <PageItem
                    key={node.id}
                    node={node}
                    activeId={activeId}
                    pages={pageList}
                    onMovePage={onMovePage}
                    onRenamePage={onRenamePage}
                    onRequestDelete={(pageId) => setDeleteTarget(pageList.find((page) => page.id === pageId) ?? null)}
                    onSelectPage={selectPage}
                  />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger render={<SidebarMenuButton size="lg" />}>
                  <Avatar size="sm">
                    {user.image && <AvatarImage src={user.image} alt={user.name ?? "Tài khoản"} />}
                    <AvatarFallback>{userInitials(user)}</AvatarFallback>
                  </Avatar>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{user.name ?? "Tài khoản"}</span>
                    <span className="truncate text-muted-foreground">{user.email}</span>
                  </span>
                  <ChevronsUpDown />
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="end" className="w-60">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>Giao diện</DropdownMenuLabel>
                    <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={(value) => setTheme(String(value))}>
                      <DropdownMenuRadioItem value="light"><Sun />Sáng</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="dark"><Moon />Tối</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="system"><Monitor />Theo hệ thống</DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem variant="destructive" onClick={() => signOut({ redirectTo: "/login" })}><LogOut />Đăng xuất</DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia><Trash2 /></AlertDialogMedia>
            <AlertDialogTitle>Xóa “{deleteTarget?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteCount > 1
                ? `Trang này và ${deleteCount - 1} trang con sẽ được chuyển vào trạng thái đã xóa.`
                : "Trang này sẽ được chuyển vào trạng thái đã xóa."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Hủy</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={deleting} onClick={confirmDelete}>
              {deleting && <Loader2 className="animate-spin" data-icon="inline-start" />}Xóa {deleteCount} trang
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
