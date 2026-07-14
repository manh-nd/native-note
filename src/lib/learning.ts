export type Verdict = "correct" | "partially_correct" | "incorrect";

export function contextFingerprint(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim().slice(0, 180);
}

export function nextLearningState(currentStreak: number, verdict: Verdict, isNewContext: boolean, now = new Date()) {
  const next = new Date(now);
  if (verdict === "correct" && !isNewContext) {
    return { correctStreak: currentStreak, status: currentStreak >= 3 ? "mastered" as const : "active" as const, dueAt: next };
  }
  if (verdict === "correct" && isNewContext) {
    const streak = Math.min(3, currentStreak + 1);
    next.setDate(next.getDate() + [0, 1, 3, 7][streak]);
    return { correctStreak: streak, status: streak >= 3 ? "mastered" as const : "active" as const, dueAt: next };
  }
  const streak = verdict === "partially_correct" ? Math.max(0, currentStreak - 1) : 0;
  next.setHours(next.getHours() + (verdict === "partially_correct" ? 12 : 4));
  return { correctStreak: streak, status: "active" as const, dueAt: next };
}

export function findingMatchesCurrentText(currentText: string, original: string, from: number, to: number) {
  return from >= 0 && to <= currentText.length && from < to && currentText.slice(from, to) === original;
}
