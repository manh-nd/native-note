export class InstructionPriorityResolver {
  resolvePriority({
    pageInstruction,
    workspaceInstruction,
  }: {
    pageInstruction: string | null;
    workspaceInstruction: string | null;
  }): string | null {
    if (pageInstruction && pageInstruction.trim().length > 0) {
      return pageInstruction;
    }
    if (workspaceInstruction && workspaceInstruction.trim().length > 0) {
      return workspaceInstruction;
    }
    return null;
  }
}
