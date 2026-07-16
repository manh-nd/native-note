export type SkillInputScope = "selection" | "block" | "page";
export type SkillOutputMode = "proposal" | "read_only";
export type SkillStatus = "draft" | "disabled";
export type SkillApprovalPolicy = "required";

export type SkillMetadata = {
  inputScope: SkillInputScope;
  outputMode: SkillOutputMode;
  status: SkillStatus;
  allowedTools: string[];
  approvalPolicy: SkillApprovalPolicy;
  showInEditorMenu: boolean;
};

export function createSkillMetadata(
  metadata: Partial<SkillMetadata> = {}
): SkillMetadata {
  return {
    inputScope: metadata.inputScope ?? "selection",
    outputMode: metadata.outputMode ?? "proposal",
    status: metadata.status ?? "draft",
    allowedTools: metadata.allowedTools ?? [],
    approvalPolicy: metadata.approvalPolicy ?? "required",
    showInEditorMenu: metadata.showInEditorMenu ?? true,
  };
}
