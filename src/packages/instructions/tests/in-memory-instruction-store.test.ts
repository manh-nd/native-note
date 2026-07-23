import { describe, expect, it } from "vitest";
import { InMemoryInstructionStore, InstructionValidationError } from "../index";

describe("Headless InMemory Instruction Store & Package Assembly", () => {
  it("stores and resolves cascading instructions for page and workspace", () => {
    const store = new InMemoryInstructionStore();

    store.setWorkspaceInstruction("ws-1", "Be concise.");
    store.setPageInstruction("page-1", "Use bullet points.");

    const pageInst = store.getEffectiveInstruction({
      pageId: "page-1",
      workspaceId: "ws-1",
    });
    expect(pageInst).toBe("Use bullet points.");

    const otherPageInst = store.getEffectiveInstruction({
      pageId: "page-2",
      workspaceId: "ws-1",
    });
    expect(otherPageInst).toBe("Be concise.");
  });

  it("compiles system prompt using effective instruction and records audit snapshot", () => {
    const store = new InMemoryInstructionStore();

    store.setPageInstruction("page-1", "Use active voice.");

    const compiled = store.compileEffectivePrompt({
      systemInstruction: "You are an AI editor.",
      pageId: "page-1",
      contentRevision: 1,
    });

    expect(compiled).toContain("You are an AI editor.");
    expect(compiled).toContain("Use active voice.");

    const snapshots = store.getAuditHistory("page-1");
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].snapshot).toBe("Use active voice.");
  });

  it("throws InstructionValidationError when setting invalid instruction text", () => {
    const store = new InMemoryInstructionStore({ maxSnapshotLength: 10 });
    expect(() => store.setPageInstruction("page-1", "A".repeat(11))).toThrow(
      InstructionValidationError
    );
  });
});
