import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AgentScheduleList } from "./agent-schedule-list";
import { ScheduledProposalInbox } from "./scheduled-proposal-inbox";

describe("AgentScheduleList & ScheduledProposalInbox UI Components", () => {
  const mockSchedules = [
    {
      schedule: {
        id: "sched-1",
        agentId: "agent-1",
        pageId: "page-1",
        prompt: "Summarize weekly updates",
        frequency: "daily" as const,
        weekday: null,
        localHour: 9,
        localMinute: 0,
        timeZone: "UTC",
        enabled: true,
        nextRunAt: null,
      },
      agentName: "Summarizer Agent",
      pageTitle: "Weekly Notes",
    },
  ];

  const mockProposals = [
    {
      id: "prop-1",
      pageId: "page-1",
      pageTitle: "Weekly Notes",
      agentId: "agent-1",
      agentName: "Summarizer Agent",
      summaryVi: "Đề xuất tóm tắt nội dung tuần qua",
      status: "pending" as const,
      ageMs: 120000,
    },
  ];

  it("renders AgentScheduleList cards and triggers action callbacks", () => {
    const onToggle = vi.fn();
    const onNew = vi.fn();

    render(
      <AgentScheduleList
        schedules={mockSchedules}
        agents={[{ id: "agent-1", name: "Summarizer Agent" }]}
        pages={[{ id: "page-1", title: "Weekly Notes" }]}
        onToggleSchedule={onToggle}
        onOpenNewSchedule={onNew}
        onEditSchedule={vi.fn()}
      />
    );

    expect(
      screen.getByText("Summarizer Agent · Weekly Notes")
    ).toBeInTheDocument();
    expect(screen.getByText("Summarize weekly updates")).toBeInTheDocument();

    const switchBtn = screen.getByRole("switch", {
      name: /Bật lịch Summarizer Agent/i,
    });
    fireEvent.click(switchBtn);
    expect(onToggle).toHaveBeenCalledWith(mockSchedules[0], false);
  });

  it("renders ScheduledProposalInbox table and handles opening proposal", () => {
    const onOpen = vi.fn();

    render(
      <ScheduledProposalInbox
        proposals={mockProposals}
        onOpenProposal={onOpen}
      />
    );

    expect(screen.getByText("Hộp thư đề xuất")).toBeInTheDocument();
    expect(
      screen.getByText(/Đề xuất tóm tắt nội dung tuần qua/i)
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Mở và xem trước/i }));
    expect(onOpen).toHaveBeenCalledWith("page-1", "prop-1");
  });
});
