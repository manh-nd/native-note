import { describe, expect, it } from "vitest";
import { InstructionAuditTrail } from "../index";

describe("Instruction Audit Trail & History Manager", () => {
  it("records instruction snapshots and retrieves history by pageId", () => {
    const trail = new InstructionAuditTrail();

    trail.recordSnapshot({
      pageId: "page-1",
      contentRevision: 1,
      snapshot: "First instruction.",
      updatedAt: new Date("2026-07-23T11:00:00Z"),
    });

    trail.recordSnapshot({
      pageId: "page-1",
      contentRevision: 2,
      snapshot: "Second instruction.",
      updatedAt: new Date("2026-07-23T11:10:00Z"),
    });

    const history = trail.getSnapshotsByPageId("page-1");
    expect(history).toHaveLength(2);
    expect(history[0].contentRevision).toBe(1);
    expect(history[0].snapshot).toBe("First instruction.");
    expect(history[1].contentRevision).toBe(2);
    expect(history[1].snapshot).toBe("Second instruction.");
  });

  it("returns empty array when no snapshots exist for pageId", () => {
    const trail = new InstructionAuditTrail();
    expect(trail.getSnapshotsByPageId("unknown")).toEqual([]);
  });
});
