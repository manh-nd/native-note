import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentAutomationPanel } from "./agent-automation-panel";

describe("Agent automation panel", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/agents")
          return Response.json({ agents: [{ id: "agent-1", name: "Coach" }] });
        if (url === "/api/agent-schedules")
          return Response.json({ schedules: [] });
        if (url === "/api/schedule-deliveries")
          return Response.json({
            deliveries: [
              {
                delivery: {
                  id: "delivery-1",
                  errorCode: "DELIVERY_FAILED",
                  attemptCount: 3,
                  lastAttemptAt: "2026-07-16T08:00:00.000Z",
                },
                agentName: "Coach",
                pageTitle: "Draft",
              },
            ],
          });
        if (url === "/api/agents/agent-1/runs")
          return Response.json({
            runs: [
              {
                id: "run-1",
                status: "failed",
                trigger: "scheduled",
                errorCode: "AI_TIMEOUT",
                createdAt: "2026-07-16T09:00:00.000Z",
              },
            ],
          });
        if (url === "/api/scheduled-proposal-inbox")
          return Response.json({
            proposals: [
              {
                id: "proposal-1",
                pageId: "page-1",
                pageTitle: "Draft",
                agentId: "agent-1",
                agentName: "Coach",
                summaryVi: "Improve the introduction.",
                status: "pending",
                ageMs: 120_000,
                createdAt: "2026-07-16T10:00:00.000Z",
              },
            ],
          });
        return Response.json({}, { status: 404 });
      })
    );
  });

  it("shows the scheduled proposal inbox without accepting Page changes", async () => {
    render(
      <AgentAutomationPanel
        pages={[{ id: "page-1", title: "Draft" }]}
        activePageId="page-1"
        onOpenProposal={vi.fn()}
      />
    );

    await screen.findByRole("button", { name: "Mở tự động hóa Agent" });
    screen.getByRole("button", { name: "Mở tự động hóa Agent" }).click();
    await waitFor(() =>
      expect(screen.getByText("Improve the introduction.")).toBeVisible()
    );
    expect(screen.getAllByText("Coach · Draft")).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Mở và xem trước" })
    ).toBeVisible();
    expect(screen.getByText("AI_TIMEOUT", { exact: false })).toBeVisible();
    expect(screen.getByText("DELIVERY_FAILED", { exact: false })).toBeVisible();
    expect(
      screen.getAllByRole("button", { name: "Chạy lại an toàn" })
    ).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Chấp nhận" })).toBeNull();
  });
});
