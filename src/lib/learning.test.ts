import { describe, expect, it } from "vitest";
import { contextFingerprint, findingMatchesCurrentText, nextLearningState } from "./learning";

describe("learning progression", () => {
  const now = new Date("2026-07-12T00:00:00.000Z");

  it("requires three correct attempts in new contexts", () => {
    const first = nextLearningState(0, "correct", true, now);
    const second = nextLearningState(first.correctStreak, "correct", true, now);
    const third = nextLearningState(second.correctStreak, "correct", true, now);
    expect(first).toMatchObject({ correctStreak: 1, status: "active" });
    expect(second).toMatchObject({ correctStreak: 2, status: "active" });
    expect(third).toMatchObject({ correctStreak: 3, status: "mastered" });
  });

  it("does not increase progress for a duplicate context", () => {
    expect(nextLearningState(2, "correct", false, now)).toMatchObject({ correctStreak: 2, status: "active" });
  });

  it("reduces progress after a partially correct attempt", () => {
    expect(nextLearningState(2, "partially_correct", true, now)).toMatchObject({ correctStreak: 1, status: "active" });
  });
});

describe("finding safety", () => {
  it("only applies to an exact, current snapshot range", () => {
    expect(findingMatchesCurrentText("I look forward to hearing from you.", "look forward to", 2, 17)).toBe(true);
    expect(findingMatchesCurrentText("I am looking forward to hearing from you.", "look forward to", 2, 17)).toBe(false);
    expect(findingMatchesCurrentText("short", "short", 0, 99)).toBe(false);
  });
});

describe("context fingerprints", () => {
  it("normalizes case, punctuation, and whitespace", () => {
    expect(contextFingerprint("  I’m HAPPY, today! ")).toBe("im happy today");
  });
});
