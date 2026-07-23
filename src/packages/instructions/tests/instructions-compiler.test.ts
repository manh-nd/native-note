import { describe, expect, it } from "vitest";
import { InstructionsCompiler, InstructionValidationError } from "../index";

describe("Instructions Policy Validator & Compiler Engine", () => {
  it("compiles system instructions with personal instructions snapshot", () => {
    const compiler = new InstructionsCompiler();
    const result = compiler.compile({
      systemInstruction: "You are a writing assistant.",
      personalInstructions: {
        pageId: "page-1",
        contentRevision: 1,
        snapshot: "Use active voice.",
      },
    });

    expect(result).toContain("You are a writing assistant.");
    expect(result).toContain("Personal Instructions:");
    expect(result).toContain("Use active voice.");
  });

  it("returns system instructions unmodified when personal instructions are null", () => {
    const compiler = new InstructionsCompiler();
    const result = compiler.compile({
      systemInstruction: "You are a writing assistant.",
      personalInstructions: null,
    });

    expect(result).toBe("You are a writing assistant.");
  });

  it("throws InstructionValidationError when personal instruction snapshot exceeds max length", () => {
    const compiler = new InstructionsCompiler({ maxSnapshotLength: 50 });
    const overlyLongText = "A".repeat(51);

    expect(() =>
      compiler.compile({
        systemInstruction: "Base prompt",
        personalInstructions: {
          pageId: "page-1",
          contentRevision: 1,
          snapshot: overlyLongText,
        },
      })
    ).toThrow(InstructionValidationError);
  });
});
