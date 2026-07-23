import { describe, expect, it } from "vitest";
import { ReviewFindingAuditLog } from "../index";

describe("Review Finding Audit Log & Decision History", () => {
  it("records immutable decision entries and retrieves history by pageId", () => {
    const auditLog = new ReviewFindingAuditLog();

    auditLog.recordDecision({
      proposalId: "prop-1",
      pageId: "page-1",
      findingId: "finding-1",
      action: "accept",
      userId: "user-1",
      timestamp: new Date("2026-07-23T10:00:00Z"),
    });

    auditLog.recordDecision({
      proposalId: "prop-2",
      pageId: "page-1",
      findingId: "finding-2",
      action: "reject",
      userId: "user-1",
      timestamp: new Date("2026-07-23T10:05:00Z"),
    });

    const history = auditLog.getHistory("page-1");
    expect(history).toHaveLength(2);
    expect(history[0].proposalId).toBe("prop-1");
    expect(history[0].action).toBe("accept");
    expect(history[1].proposalId).toBe("prop-2");
    expect(history[1].action).toBe("reject");
  });

  it("returns empty array for pages without audit entries", () => {
    const auditLog = new ReviewFindingAuditLog();
    const history = auditLog.getHistory("unknown-page");
    expect(history).toEqual([]);
  });
});
