import type { DocumentContent } from "@/packages/documents";
import type { SkillMetadata } from "./skill-metadata";

export const SKILL_COMPILER_VERSION = "1";
const MAX_INSTRUCTION_LENGTH = 30_000;

export type PublishedSkillPolicy = SkillMetadata;

export type CompiledSkillDraft = {
  instructionSnapshot: string;
  policy: PublishedSkillPolicy;
  compilerVersion: typeof SKILL_COMPILER_VERSION;
};

export class SkillCompilationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SkillCompilationError";
  }
}

function unsupported(type: unknown): never {
  throw new SkillCompilationError(
    `Skill không hỗ trợ cấu trúc \"${String(type)}\".`
  );
}

function inlineText(node: DocumentContent): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  if (!node.type) unsupported("không xác định");
  unsupported(node.type);
}

function textChildren(node: DocumentContent): string {
  return (node.content ?? []).map(inlineText).join("");
}

function blockText(node: DocumentContent): string {
  switch (node.type) {
    case "paragraph":
    case "heading":
    case "blockquote":
    case "codeBlock":
      return textChildren(node);
    case "bulletList":
    case "taskList":
      return (node.content ?? [])
        .map((child) => `- ${blockText(child)}`)
        .join("\n");
    case "orderedList":
      return (node.content ?? [])
        .map((child, index) => `${index + 1}. ${blockText(child)}`)
        .join("\n");
    case "listItem":
    case "taskItem":
      return (node.content ?? []).map(blockText).join("\n");
    default:
      return unsupported(node.type);
  }
}

function normalizeInstructionText(value: string): string {
  return value
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function assertSupportedPolicyValue(
  value: string,
  supported: readonly string[],
  field: string
) {
  if (!supported.includes(value))
    throw new SkillCompilationError(
      `Skill không hỗ trợ ${field} \"${value}\".`
    );
}

function normalizePolicy(metadata: SkillMetadata): PublishedSkillPolicy {
  assertSupportedPolicyValue(
    metadata.inputScope,
    ["selection", "block", "page"],
    "phạm vi"
  );
  assertSupportedPolicyValue(
    metadata.outputMode,
    ["proposal", "read_only"],
    "chế độ đầu ra"
  );
  assertSupportedPolicyValue(
    metadata.status,
    ["draft", "disabled"],
    "trạng thái"
  );
  assertSupportedPolicyValue(
    metadata.approvalPolicy,
    ["required"],
    "chính sách phê duyệt"
  );
  return {
    inputScope: metadata.inputScope,
    outputMode: metadata.outputMode,
    status: metadata.status,
    allowedTools: [...new Set(metadata.allowedTools.map((tool) => tool.trim()))]
      .filter(Boolean)
      .sort(),
    approvalPolicy: metadata.approvalPolicy,
    showInEditorMenu: metadata.showInEditorMenu,
  };
}

export function compileSkillDraft({
  content,
  metadata,
}: {
  content: DocumentContent;
  metadata: SkillMetadata;
}): CompiledSkillDraft {
  if (content.type !== "doc") unsupported(content.type);
  const instructionSnapshot = normalizeInstructionText(
    (content.content ?? []).map(blockText).join("\n\n")
  );
  if (!instructionSnapshot) {
    throw new SkillCompilationError("Hướng dẫn Skill không được để trống.");
  }
  if (instructionSnapshot.length > MAX_INSTRUCTION_LENGTH) {
    throw new SkillCompilationError(
      `Hướng dẫn Skill vượt quá ${MAX_INSTRUCTION_LENGTH.toLocaleString("vi-VN")} ký tự.`
    );
  }
  return {
    instructionSnapshot,
    policy: normalizePolicy(metadata),
    compilerVersion: SKILL_COMPILER_VERSION,
  };
}
