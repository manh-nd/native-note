import { describe, expect, it } from "vitest";
import {
  applyPersonalInstructions,
  type PersonalInstructionsSnapshot,
} from "@/packages/instructions";

const snapshot: PersonalInstructionsSnapshot = {
  pageId: "11111111-1111-4111-8111-111111111111",
  contentRevision: 7,
  snapshot: "Prefer concise answers and British spelling.",
};

describe("personal Instructions", () => {
  it("adds the immutable active Instructions snapshot to ordinary AI context", () => {
    expect(applyPersonalInstructions("Coach the writer.", snapshot)).toBe(
      "Coach the writer.\n\nPersonal Instructions:\nPrefer concise answers and British spelling."
    );
  });

  it("does not implicitly apply personal Instructions when a caller supplies none, including custom Agents", () => {
    expect(applyPersonalInstructions("Coach the writer.", null)).toBe(
      "Coach the writer."
    );
  });
});
