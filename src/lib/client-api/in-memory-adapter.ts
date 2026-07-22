import type {
  AcceptProposalResult,
  CreatePageInput,
  MarkSkillInput,
  PageRow,
  SkillRow,
  SkillVersionRow,
  UpdatePageContentInput,
  UpdatePageMetadataInput,
  UpdateSkillInput,
  WorkspaceApiClient,
} from "./types";
import type { PublishedSkillPolicy } from "@/packages/skills";
import type { DocumentContent } from "@/packages/documents";

export class InMemoryWorkspaceApiClient implements WorkspaceApiClient {
  private pages: Map<string, PageRow> = new Map();
  private skills: Map<string, SkillRow> = new Map();
  private skillVersions: Map<string, SkillVersionRow[]> = new Map();

  constructor(initialPages: PageRow[] = [], initialSkills: SkillRow[] = []) {
    for (const page of initialPages) {
      this.pages.set(page.id, { ...page });
    }
    for (const skill of initialSkills) {
      this.skills.set(skill.pageId, { ...skill });
    }
  }

  async listPages(): Promise<PageRow[]> {
    return Array.from(this.pages.values()).filter((p) => p.deletedAt === null);
  }

  async getPage(pageId: string): Promise<PageRow | null> {
    const page = this.pages.get(pageId);
    if (!page || page.deletedAt !== null) return null;
    return { ...page };
  }

  async createPage(input: CreatePageInput): Promise<PageRow> {
    const id = `page-${crypto.randomUUID()}`;
    const now = new Date();
    const newPage: PageRow = {
      id,
      workspaceId: "ws-test",
      title: input.title ?? "Không có tiêu đề",
      content: { type: "doc", content: [{ type: "paragraph" }] },
      documentSchemaVersion: 1,
      plainText: "",
      parentId: input.parentId ?? null,
      position: input.position ?? this.pages.size,
      contentRevision: 1,
      metadataRevision: 1,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.pages.set(id, newPage);

    if (input.markAsSkill) {
      await this.markPageAsSkill(id);
    }
    return { ...newPage };
  }

  async updatePageMetadata(
    pageId: string,
    input: UpdatePageMetadataInput
  ): Promise<PageRow> {
    const page = this.pages.get(pageId);
    if (!page) throw new Error("Trang không tồn tại.");

    const updated: PageRow = {
      ...page,
      title: input.title ?? page.title,
      parentId: input.parentId !== undefined ? input.parentId : page.parentId,
      position: input.position ?? page.position,
      metadataRevision: page.metadataRevision + 1,
      updatedAt: new Date(),
    };
    this.pages.set(pageId, updated);
    return { ...updated };
  }

  async updatePageContent(
    pageId: string,
    input: UpdatePageContentInput
  ): Promise<PageRow> {
    const page = this.pages.get(pageId);
    if (!page) throw new Error("Trang không tồn tại.");

    const updated: PageRow = {
      ...page,
      content: input.content as DocumentContent,
      contentRevision: page.contentRevision + 1,
      updatedAt: new Date(),
    };
    this.pages.set(pageId, updated);
    return { ...updated };
  }

  async deletePage(pageId: string): Promise<boolean> {
    const page = this.pages.get(pageId);
    if (!page) return false;
    this.pages.delete(pageId);
    this.skills.delete(pageId);
    return true;
  }

  async movePage(
    pageId: string,
    _action: "up" | "down" | "indent" | "outdent"
  ): Promise<PageRow[]> {
    return this.listPages();
  }

  async listSkills(): Promise<Record<string, SkillRow>> {
    const result: Record<string, SkillRow> = {};
    for (const [pageId, skill] of this.skills.entries()) {
      result[pageId] = { ...skill };
    }
    return result;
  }

  async markPageAsSkill(
    pageId: string,
    input?: MarkSkillInput
  ): Promise<SkillRow> {
    const now = new Date();
    const skill: SkillRow = {
      id: `skill-${crypto.randomUUID()}`,
      pageId,
      creatorId: "user-test",
      inputScope: input?.inputScope ?? "selection",
      outputMode: input?.outputMode ?? "proposal",
      allowedTools: input?.allowedTools ?? [],
      approvalPolicy: input?.approvalPolicy ?? "required",
      showInEditorMenu: input?.showInEditorMenu ?? true,
      status: "draft",
      activeVersionId: null,
      createdAt: now,
      updatedAt: now,
    };
    this.skills.set(pageId, skill);
    return { ...skill };
  }

  async updateSkill(
    pageId: string,
    input: UpdateSkillInput
  ): Promise<SkillRow> {
    const skill = this.skills.get(pageId);
    if (!skill) throw new Error("Skill không tồn tại.");

    const updated: SkillRow = {
      ...skill,
      ...input,
      updatedAt: new Date(),
    };
    this.skills.set(pageId, updated);
    return { ...updated };
  }

  async publishSkillVersion(pageId: string): Promise<SkillVersionRow> {
    const skill = this.skills.get(pageId);
    if (!skill) throw new Error("Skill không tồn tại.");

    const versions = this.skillVersions.get(pageId) ?? [];
    const policy: PublishedSkillPolicy = {
      inputScope: skill.inputScope,
      outputMode: skill.outputMode,
      allowedTools: skill.allowedTools,
      approvalPolicy: skill.approvalPolicy,
      showInEditorMenu: skill.showInEditorMenu,
      status: skill.status,
    };
    const newVersion: SkillVersionRow = {
      id: `version-${crypto.randomUUID()}`,
      skillId: skill.id,
      version: versions.length + 1,
      instructionSnapshot: "Test instruction",
      policy,
      compilerVersion: "1.0",
      sourceContentRevision: 1,
      publishedBy: "user-test",
      publishedAt: new Date(),
    };
    versions.push(newVersion);
    this.skillVersions.set(pageId, versions);

    skill.status = "disabled";
    skill.activeVersionId = newVersion.id;
    this.skills.set(pageId, skill);

    return { ...newVersion };
  }

  async unmarkPageAsSkill(pageId: string): Promise<boolean> {
    const deleted = this.skills.delete(pageId);
    return deleted;
  }

  async acceptProposal(proposalId: string): Promise<AcceptProposalResult> {
    const firstPage = Array.from(this.pages.values())[0];
    return {
      accepted: true,
      page: firstPage ? { ...firstPage } : undefined,
      proposal: { id: proposalId },
    };
  }

  async rejectProposal(_proposalId: string): Promise<boolean> {
    return true;
  }
}
