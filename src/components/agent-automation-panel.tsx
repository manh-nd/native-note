"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AgentScheduleList,
  type AgentScheduleEntry,
} from "./agent-scheduler/agent-schedule-list";
import {
  ScheduledProposalInbox,
  type InboxProposal,
} from "./agent-scheduler/scheduled-proposal-inbox";
import { HttpAgentSchedulerClient } from "@/packages/agent-scheduler";

type PageOption = { id: string; title: string };
type AgentOption = { id: string; name: string };

type ScheduledAgentRun = {
  id: string;
  agentId: string;
  agentName: string;
  status: "running" | "completed" | "failed" | "cancelled" | "step_limit";
  trigger: "manual" | "scheduled";
  errorCode: string | null;
  createdAt: string;
};

type FailedScheduleDelivery = {
  delivery: {
    id: string;
    errorCode: string | null;
    attemptCount: number;
    lastAttemptAt: string;
  };
  agentName: string;
  pageTitle: string;
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? "Yêu cầu thất bại.");
  }
  return response.json() as Promise<T>;
}

export function AgentAutomationPanel({
  pages,
  activePageId,
  onOpenProposal,
}: {
  pages: PageOption[];
  activePageId: string;
  onOpenProposal: (pageId: string, proposalId: string) => void | Promise<void>;
}) {
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [schedules, setSchedules] = useState<AgentScheduleEntry[]>([]);
  const [proposals, setProposals] = useState<InboxProposal[]>([]);
  const [scheduledRuns, setScheduledRuns] = useState<ScheduledAgentRun[]>([]);
  const [failedDeliveries, setFailedDeliveries] = useState<
    FailedScheduleDelivery[]
  >([]);
  const [dashboardOpen, setDashboardOpen] = useState(false);

  const schedulerClient = useMemo(() => new HttpAgentSchedulerClient(), []);

  const refresh = useCallback(async () => {
    try {
      const [agentRes, scheduleRes, inboxRes, deliveryRes] = await Promise.all([
        requestJson<{ agents: AgentOption[] }>("/api/agents"),
        requestJson<{ schedules: AgentScheduleEntry[] }>(
          "/api/agent-schedules"
        ),
        requestJson<{ proposals: InboxProposal[] }>(
          "/api/scheduled-proposal-inbox"
        ),
        requestJson<{ deliveries: FailedScheduleDelivery[] }>(
          "/api/schedule-deliveries"
        ),
      ]);
      setAgents(agentRes.agents);
      setSchedules(scheduleRes.schedules);
      setProposals(inboxRes.proposals);
      setFailedDeliveries(deliveryRes.deliveries);

      const histories = await Promise.all(
        agentRes.agents.map(async (agent) => ({
          agent,
          runs: (
            await requestJson<{
              runs: Omit<ScheduledAgentRun, "agentId" | "agentName">[];
            }>(`/api/agents/${agent.id}/runs`)
          ).runs,
        }))
      );
      setScheduledRuns(
        histories.flatMap(({ agent, runs }) =>
          runs
            .filter((run) => run.trigger === "scheduled")
            .map((run) => ({
              ...run,
              agentId: agent.id,
              agentName: agent.name,
            }))
        )
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Không thể tải tự động hóa Agent."
      );
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleToggleSchedule(
    entry: AgentScheduleEntry,
    enabled: boolean
  ) {
    try {
      await schedulerClient.toggleSchedule(entry.schedule.id, enabled);
      await refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Không thể đổi trạng thái lịch."
      );
    }
  }

  async function handleRetryDelivery(deliveryId: string) {
    try {
      await requestJson(`/api/schedule-deliveries/${deliveryId}/retry`, {
        method: "POST",
      });
      toast.success("Đã chạy lại lần giao lịch.");
      await refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Không thể chạy lại lịch."
      );
    }
  }

  async function handleRetryRun(run: ScheduledAgentRun) {
    try {
      await requestJson(`/api/agents/${run.agentId}/runs/${run.id}/retry`, {
        method: "POST",
      });
      toast.success("Đã chạy lại Agent.");
      await refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Không thể chạy lại Agent."
      );
    }
  }

  return (
    <>
      <Dialog open={dashboardOpen} onOpenChange={setDashboardOpen}>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setDashboardOpen(true)}
          aria-label="Mở tự động hóa Agent"
        >
          <CalendarClock data-icon="inline-start" />
          Tự động hóa
          {proposals.length > 0 && (
            <Badge variant="secondary">{proposals.length}</Badge>
          )}
        </Button>
        <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Tự động hóa Agent</DialogTitle>
            <DialogDescription>
              Quản lý lịch nền và các đề xuất đang chờ phê duyệt.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3" aria-label="Tự động hóa Agent">
            <AgentScheduleList
              schedules={schedules}
              agents={agents}
              pages={pages}
              onToggleSchedule={handleToggleSchedule}
              onOpenNewSchedule={() => {}}
              onEditSchedule={() => {}}
            />
            <ScheduledProposalInbox
              proposals={proposals}
              onOpenProposal={onOpenProposal}
            />

            {/* Schedule Runs & Deliveries Failures Section */}
            {(scheduledRuns.length > 0 || failedDeliveries.length > 0) && (
              <div className="space-y-2 pt-2">
                {failedDeliveries.map(({ delivery, agentName, pageTitle }) => (
                  <div
                    key={delivery.id}
                    className="flex items-center justify-between rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs"
                  >
                    <div>
                      <span className="font-medium text-foreground">
                        {agentName} · {pageTitle}
                      </span>
                      <p className="text-muted-foreground">
                        {delivery.errorCode ?? "DELIVERY_FAILED"} · lần{" "}
                        {delivery.attemptCount}
                      </p>
                    </div>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => void handleRetryDelivery(delivery.id)}
                    >
                      Chạy lại an toàn
                    </Button>
                  </div>
                ))}
                {scheduledRuns.slice(0, 5).map((run) => (
                  <div
                    key={run.id}
                    className="flex items-center justify-between rounded-lg border border-border bg-card p-3 text-xs"
                  >
                    <div>
                      <span className="font-medium text-foreground">
                        {run.agentName}
                      </span>
                      <p className="text-muted-foreground">
                        {run.status} {run.errorCode ? `· ${run.errorCode}` : ""}
                      </p>
                    </div>
                    {["failed", "cancelled", "step_limit"].includes(
                      run.status
                    ) && (
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => void handleRetryRun(run)}
                      >
                        Chạy lại an toàn
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
