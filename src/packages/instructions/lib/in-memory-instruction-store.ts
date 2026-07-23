import {
  InstructionAuditTrail,
  type AuditSnapshotEntry,
} from "./instruction-audit-trail";
import { InstructionPriorityResolver } from "./instruction-priority-resolver";
import {
  CompilerOptions,
  InstructionsCompiler,
  InstructionValidationError,
} from "./instructions-compiler";

export class InMemoryInstructionStore {
  private pageInstructions = new Map<string, string>();
  private workspaceInstructions = new Map<string, string>();
  private compiler: InstructionsCompiler;
  private resolver = new InstructionPriorityResolver();
  private auditTrail = new InstructionAuditTrail();

  constructor(options: CompilerOptions = {}) {
    this.compiler = new InstructionsCompiler(options);
  }

  setPageInstruction(pageId: string, instruction: string): void {
    const compiled = this.compiler.compile({
      systemInstruction: "test",
      personalInstructions: {
        pageId,
        contentRevision: 1,
        snapshot: instruction,
      },
    });
    if (!compiled) {
      throw new InstructionValidationError("Invalid instruction");
    }
    this.pageInstructions.set(pageId, instruction);
  }

  setWorkspaceInstruction(workspaceId: string, instruction: string): void {
    const compiled = this.compiler.compile({
      systemInstruction: "test",
      personalInstructions: {
        pageId: "ws",
        contentRevision: 1,
        snapshot: instruction,
      },
    });
    if (!compiled) {
      throw new InstructionValidationError("Invalid instruction");
    }
    this.workspaceInstructions.set(workspaceId, instruction);
  }

  getEffectiveInstruction({
    pageId,
    workspaceId,
  }: {
    pageId: string;
    workspaceId?: string | null;
  }): string | null {
    const pageInst = this.pageInstructions.get(pageId) ?? null;
    const wsInst = workspaceId
      ? (this.workspaceInstructions.get(workspaceId) ?? null)
      : null;
    return this.resolver.resolvePriority({
      pageInstruction: pageInst,
      workspaceInstruction: wsInst,
    });
  }

  compileEffectivePrompt({
    systemInstruction,
    pageId,
    workspaceId,
    contentRevision = 1,
  }: {
    systemInstruction: string;
    pageId: string;
    workspaceId?: string | null;
    contentRevision?: number;
  }): string {
    const effective = this.getEffectiveInstruction({ pageId, workspaceId });
    if (effective) {
      this.auditTrail.recordSnapshot({
        pageId,
        contentRevision,
        snapshot: effective,
        updatedAt: new Date(),
      });
    }

    return this.compiler.compile({
      systemInstruction,
      personalInstructions: effective
        ? { pageId, contentRevision, snapshot: effective }
        : null,
    });
  }

  getAuditHistory(pageId: string): readonly AuditSnapshotEntry[] {
    return this.auditTrail.getSnapshotsByPageId(pageId);
  }
}
