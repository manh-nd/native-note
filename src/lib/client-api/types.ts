import type { pages, skills, skillVersions } from "@/db/schema";
import type { PublishedSkillPolicy } from "@/packages/skills";

export type PageRow = typeof pages.$inferSelect;
export type SkillRow = typeof skills.$inferSelect;
export type SkillVersionRow = typeof skillVersions.$inferSelect;

export type CreatePageInput = {
  title?: string;
  parentId?: string | null;
  position?: number;
  markAsSkill?: boolean;
};

export type UpdatePageMetadataInput = Partial<
  Pick<PageRow, "title" | "parentId" | "position">
> & {
  metadataRevision: number;
};

export type UpdatePageContentInput = {
  content: unknown;
  contentRevision: number;
};

export type MarkSkillInput = {
  inputScope?: "selection" | "block" | "page";
  outputMode?: "proposal" | "read_only";
  allowedTools?: string[];
  approvalPolicy?: "required";
  showInEditorMenu?: boolean;
};

export type UpdateSkillInput = Partial<
  Pick<
    SkillRow,
    | "inputScope"
    | "outputMode"
    | "allowedTools"
    | "approvalPolicy"
    | "showInEditorMenu"
    | "status"
  >
>;

export type AcceptProposalResult = {
  accepted: boolean;
  page?: PageRow;
  proposal?: unknown;
};

export interface WorkspaceApiClient {
  listPages(): Promise<PageRow[]>;
  getPage(pageId: string): Promise<PageRow | null>;
  createPage(input: CreatePageInput): Promise<PageRow>;
  updatePageMetadata(
    pageId: string,
    input: UpdatePageMetadataInput
  ): Promise<PageRow>;
  updatePageContent(
    pageId: string,
    input: UpdatePageContentInput
  ): Promise<PageRow>;
  deletePage(pageId: string): Promise<boolean>;
  movePage(
    pageId: string,
    action: "up" | "down" | "indent" | "outdent"
  ): Promise<PageRow[]>;

  listSkills(): Promise<Record<string, SkillRow>>;
  markPageAsSkill(pageId: string, input?: MarkSkillInput): Promise<SkillRow>;
  updateSkill(pageId: string, input: UpdateSkillInput): Promise<SkillRow>;
  publishSkillVersion(pageId: string): Promise<SkillVersionRow>;
  unmarkPageAsSkill(pageId: string): Promise<boolean>;

  acceptProposal(proposalId: string): Promise<AcceptProposalResult>;
  rejectProposal(proposalId: string): Promise<boolean>;
}
