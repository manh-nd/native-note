import { describe, expect, it } from "vitest";
import { InstructionPriorityResolver } from "../index";

describe("Cascading Instruction Priority Resolver", () => {
  it("prioritizes page-level instruction over workspace-level instruction", () => {
    const resolver = new InstructionPriorityResolver();
    const resolved = resolver.resolvePriority({
      pageInstruction: "Use short sentences.",
      workspaceInstruction: "Use formal tone.",
    });

    expect(resolved).toBe("Use short sentences.");
  });

  it("falls back to workspace-level instruction when page-level is missing", () => {
    const resolver = new InstructionPriorityResolver();
    const resolved = resolver.resolvePriority({
      pageInstruction: null,
      workspaceInstruction: "Use formal tone.",
    });

    expect(resolved).toBe("Use formal tone.");
  });

  it("returns null when neither page nor workspace instructions exist", () => {
    const resolver = new InstructionPriorityResolver();
    const resolved = resolver.resolvePriority({
      pageInstruction: null,
      workspaceInstruction: null,
    });

    expect(resolved).toBeNull();
  });
});
