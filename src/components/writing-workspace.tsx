"use client";

import { useMemo, useState } from "react";
import type { User } from "next-auth";
import type { MenuSkill } from "@/packages/skills";
import type { PageRow, SkillRow, SkillVersionRow } from "@/lib/client-api";
import { HttpWorkspaceApiClient } from "@/lib/client-api";
import {
  WorkspaceProvider,
  useWorkspaceActions,
  useWorkspaceState,
} from "./workspace-context";
import { WorkspaceBreadcrumb } from "./editor/workspace-breadcrumb";
import {
  SkillPropertyBar,
  SkillStudioSheet,
} from "./editor/skill-studio-sheet";
import { useProposalOrchestrator } from "./editor/use-proposal-orchestrator";
import { useSlashMenu } from "./editor/use-slash-menu";
import { useSelectionBubbleMenu } from "./editor/use-selection-bubble-menu";

export type WritingWorkspaceProps = {
  initialPages: PageRow[];
  initialSkills: SkillRow[] | Record<string, SkillRow>;
  initialMenuSkills: MenuSkill[];
  user: User;
  initialActivePageId?: string;
  defaultSidebarOpen: boolean;
  initialInstructionsPageId?: string | null;
};

export function WritingWorkspace(props: WritingWorkspaceProps) {
  const defaultPageId =
    props.initialActivePageId ?? props.initialPages[0]?.id ?? "";

  return (
    <WorkspaceProvider initialActivePageId={defaultPageId} initialView="write">
      <WorkspaceShell {...props} />
    </WorkspaceProvider>
  );
}

function WorkspaceShell(props: WritingWorkspaceProps) {
  const apiClient = useMemo(() => new HttpWorkspaceApiClient(), []);
  const state = useWorkspaceState();
  const actions = useWorkspaceActions();

  const [pages, setPages] = useState<PageRow[]>(props.initialPages);
  const [skills, setSkills] = useState<Record<string, SkillRow>>(() => {
    if (Array.isArray(props.initialSkills)) {
      const map: Record<string, SkillRow> = {};
      for (const s of props.initialSkills) {
        map[s.pageId] = s;
      }
      return map;
    }
    return props.initialSkills;
  });

  const proposalOrchestrator = useProposalOrchestrator();
  const slashMenu = useSlashMenu();
  const selectionMenu = useSelectionBubbleMenu();

  const activePage = useMemo(
    () => pages.find((p) => p.id === state.activePageId) ?? pages[0],
    [pages, state.activePageId]
  );
  const activeSkill = activePage ? skills[activePage.id] : undefined;

  async function handleUpdateMetadata(title: string) {
    if (!activePage) return;
    const updated = await apiClient.updatePageMetadata(activePage.id, {
      title,
      metadataRevision: activePage.metadataRevision,
    });
    setPages((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  }

  async function handleMarkSkill() {
    if (!activePage) return;
    const skill = await apiClient.markPageAsSkill(activePage.id);
    setSkills((prev) => ({ ...prev, [activePage.id]: skill }));
  }

  async function handleUnmarkSkill() {
    if (!activePage) return;
    await apiClient.unmarkPageAsSkill(activePage.id);
    setSkills((prev) => {
      const next = { ...prev };
      delete next[activePage.id];
      return next;
    });
  }

  async function handleUpdateSkill(patch: Partial<SkillRow>) {
    if (!activePage || !activeSkill) return;
    const updated = await apiClient.updateSkill(activePage.id, patch);
    setSkills((prev) => ({ ...prev, [activePage.id]: updated }));
  }

  async function handlePublishVersion() {
    if (!activePage || !activeSkill) return;
    await apiClient.publishSkillVersion(activePage.id);
    const updatedSkills = await apiClient.listSkills();
    setSkills(updatedSkills);
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background font-sans text-foreground">
      {/* Main Workspace Column */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Workspace Topbar */}
        <header className="flex h-12 items-center justify-between border-b border-border px-4">
          <WorkspaceBreadcrumb
            activePageId={state.activePageId}
            pages={pages}
            onSelectPage={actions.selectPage}
          />
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {props.user.name ?? "User"}
            </span>
          </div>
        </header>

        {/* Editor Main Canvas */}
        <main className="flex-1 overflow-y-auto p-8">
          <div className="mx-auto max-w-3xl space-y-4">
            {/* Title Input */}
            <input
              type="text"
              className="w-full bg-transparent font-serif text-3xl font-bold outline-hidden focus:outline-hidden"
              value={activePage?.title ?? ""}
              onChange={(e) => handleUpdateMetadata(e.target.value)}
              placeholder="Không có tiêu đề"
            />

            {/* Notion Property Bar for Skills */}
            {activeSkill && (
              <SkillPropertyBar
                skill={activeSkill}
                onOpenDrawer={actions.setSkillDrawerOpen}
              />
            )}
          </div>
        </main>
      </div>

      {/* Notion Skill Studio Side Peek Drawer */}
      {activeSkill && (
        <SkillStudioSheet
          open={state.skillDrawerOpen}
          onOpenChange={actions.setSkillDrawerOpen}
          skill={activeSkill}
          versions={[]}
          onUpdateSkill={handleUpdateSkill}
          onPublishVersion={handlePublishVersion}
          onUnmarkSkill={handleUnmarkSkill}
        />
      )}
    </div>
  );
}
