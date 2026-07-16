"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, Inbox, Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type PageOption = { id: string; title: string };
type AgentOption = { id: string; name: string };
type AgentSchedule = {
  id: string;
  agentId: string;
  pageId: string;
  prompt: string;
  frequency: "daily" | "weekly";
  weekday: number | null;
  localHour: number;
  localMinute: number;
  timeZone: string;
  enabled: boolean;
  nextRunAt: string | null;
};
type AgentScheduleEntry = {
  schedule: AgentSchedule;
  agentName: string;
  pageTitle: string;
};
type InboxProposal = {
  id: string;
  pageId: string;
  pageTitle: string;
  agentId: string;
  agentName: string;
  summaryVi: string;
  status: "pending" | "stale";
  ageMs: number;
};
type AgentScheduleForm = Omit<AgentSchedule, "id" | "nextRunAt">;
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

async function loadAutomationData() {
  const [agentResult, scheduleResult, inboxResult, deliveryResult] =
    await Promise.all([
      requestJson<{ agents: AgentOption[] }>("/api/agents"),
      requestJson<{ schedules: AgentScheduleEntry[] }>("/api/agent-schedules"),
      requestJson<{ proposals: InboxProposal[] }>(
        "/api/scheduled-proposal-inbox"
      ),
      requestJson<{ deliveries: FailedScheduleDelivery[] }>(
        "/api/schedule-deliveries"
      ),
    ]);
  const histories = await Promise.all(
    agentResult.agents.map(async (agent) => ({
      agent,
      runs: (
        await requestJson<{
          runs: Omit<ScheduledAgentRun, "agentId" | "agentName">[];
        }>(`/api/agents/${agent.id}/runs`)
      ).runs,
    }))
  );
  const scheduledRuns = histories.flatMap(({ agent, runs }) =>
    runs
      .filter((run) => run.trigger === "scheduled")
      .map((run) => ({ ...run, agentId: agent.id, agentName: agent.name }))
  );
  return {
    agentResult,
    scheduleResult,
    inboxResult,
    deliveryResult,
    scheduledRuns,
  };
}

function timeValue(schedule: Pick<AgentSchedule, "localHour" | "localMinute">) {
  return `${String(schedule.localHour).padStart(2, "0")}:${String(
    schedule.localMinute
  ).padStart(2, "0")}`;
}

function proposalAge(ageMs: number) {
  const minutes = Math.max(1, Math.floor(ageMs / 60_000));
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return `${Math.floor(hours / 24)} ngày trước`;
}

function defaultForm(activePageId: string): AgentScheduleForm {
  return {
    agentId: "",
    pageId: activePageId,
    prompt: "",
    frequency: "daily",
    weekday: null,
    localHour: 9,
    localMinute: 0,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    enabled: true,
  };
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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(() => defaultForm(activePageId));
  const [saving, setSaving] = useState(false);

  const applyAutomationData = useCallback(
    ({
      agentResult,
      scheduleResult,
      inboxResult,
      deliveryResult,
      scheduledRuns: loadedRuns,
    }: Awaited<ReturnType<typeof loadAutomationData>>) => {
      setAgents(agentResult.agents);
      setSchedules(scheduleResult.schedules);
      setProposals(inboxResult.proposals);
      setFailedDeliveries(deliveryResult.deliveries);
      setScheduledRuns(loadedRuns);
      setForm((current) => ({
        ...current,
        agentId: current.agentId || agentResult.agents[0]?.id || "",
      }));
    },
    []
  );

  const refresh = useCallback(async () => {
    try {
      applyAutomationData(await loadAutomationData());
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Không thể tải tự động hóa Agent."
      );
    }
  }, [applyAutomationData]);

  useEffect(() => {
    let cancelled = false;
    void loadAutomationData()
      .then((data) => {
        if (!cancelled) applyAutomationData(data);
      })
      .catch((error) => {
        if (!cancelled)
          toast.error(
            error instanceof Error
              ? error.message
              : "Không thể tải tự động hóa Agent."
          );
      });
    return () => {
      cancelled = true;
    };
  }, [applyAutomationData]);

  const agentItems = useMemo(
    () => agents.map((agent) => ({ label: agent.name, value: agent.id })),
    [agents]
  );
  const pageItems = useMemo(
    () => pages.map((page) => ({ label: page.title, value: page.id })),
    [pages]
  );
  const weekdayItems = [
    "Chủ nhật",
    "Thứ hai",
    "Thứ ba",
    "Thứ tư",
    "Thứ năm",
    "Thứ sáu",
    "Thứ bảy",
  ].map((label, value) => ({ label, value: String(value) }));

  function openNewSchedule() {
    setEditingId(null);
    setForm({
      ...defaultForm(activePageId),
      agentId: agents[0]?.id ?? "",
    });
    setDialogOpen(true);
  }

  function openSchedule(entry: AgentScheduleEntry) {
    setEditingId(entry.schedule.id);
    setForm({
      agentId: entry.schedule.agentId,
      pageId: entry.schedule.pageId,
      prompt: entry.schedule.prompt,
      frequency: entry.schedule.frequency,
      weekday: entry.schedule.weekday,
      localHour: entry.schedule.localHour,
      localMinute: entry.schedule.localMinute,
      timeZone: entry.schedule.timeZone,
      enabled: entry.schedule.enabled,
    });
    setDialogOpen(true);
  }

  async function saveSchedule(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await requestJson(
        editingId
          ? `/api/agent-schedules/${editingId}`
          : "/api/agent-schedules",
        {
          method: editingId ? "PUT" : "POST",
          body: JSON.stringify(form),
        }
      );
      setDialogOpen(false);
      toast.success(editingId ? "Đã cập nhật lịch." : "Đã tạo lịch.");
      await refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Không thể lưu lịch."
      );
    } finally {
      setSaving(false);
    }
  }

  async function setScheduleEnabled(
    entry: AgentScheduleEntry,
    enabled: boolean
  ) {
    const schedule = entry.schedule;
    try {
      await requestJson(`/api/agent-schedules/${schedule.id}`, {
        method: "PUT",
        body: JSON.stringify({
          agentId: schedule.agentId,
          pageId: schedule.pageId,
          prompt: schedule.prompt,
          frequency: schedule.frequency,
          weekday: schedule.weekday,
          localHour: schedule.localHour,
          localMinute: schedule.localMinute,
          timeZone: schedule.timeZone,
          enabled,
        }),
      });
      await refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Không thể đổi trạng thái lịch."
      );
    }
  }

  async function retryScheduledRun(run: ScheduledAgentRun) {
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

  async function retryScheduleDelivery(deliveryId: string) {
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
            <Card>
              <CardHeader>
                <CardTitle>Lịch Agent</CardTitle>
                <CardDescription>
                  Chạy Agent nền theo giờ địa phương; mọi thay đổi Page vẫn cần
                  phê duyệt.
                </CardDescription>
                <CardAction>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={openNewSchedule}
                    disabled={agents.length === 0}
                  >
                    <Plus data-icon="inline-start" />
                    Thêm lịch
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {schedules.length === 0 ? (
                  <Empty>
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <CalendarClock />
                      </EmptyMedia>
                      <EmptyTitle>Chưa có lịch Agent</EmptyTitle>
                      <EmptyDescription>
                        Tạo một Agent trước, rồi lên lịch cho Page cần theo dõi.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  schedules.map((entry) => (
                    <Card key={entry.schedule.id} size="sm">
                      <CardHeader>
                        <CardTitle>
                          {entry.agentName} · {entry.pageTitle}
                        </CardTitle>
                        <CardDescription>
                          {entry.schedule.prompt}
                        </CardDescription>
                        <CardAction>
                          <Switch
                            aria-label={`Bật lịch ${entry.agentName}`}
                            checked={entry.schedule.enabled}
                            onCheckedChange={(enabled) =>
                              void setScheduleEnabled(entry, enabled)
                            }
                          />
                        </CardAction>
                      </CardHeader>
                      <CardFooter className="gap-2">
                        <Badge variant="secondary">
                          {entry.schedule.frequency === "daily"
                            ? "Hàng ngày"
                            : weekdayItems[entry.schedule.weekday ?? 0].label}
                          {" · "}
                          {timeValue(entry.schedule)} {entry.schedule.timeZone}
                        </Badge>
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => openSchedule(entry)}
                        >
                          Sửa
                        </Button>
                      </CardFooter>
                    </Card>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Hộp thư đề xuất</CardTitle>
                <CardDescription>
                  Đề xuất từ Agent theo lịch không bao giờ được tự động áp dụng.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {proposals.length === 0 ? (
                  <Empty>
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <Inbox />
                      </EmptyMedia>
                      <EmptyTitle>Không có đề xuất đang chờ</EmptyTitle>
                      <EmptyDescription>
                        Kết quả cần quyết định sẽ xuất hiện tại đây.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  proposals.map((proposal) => (
                    <Card key={proposal.id} size="sm">
                      <CardHeader>
                        <CardTitle>
                          {proposal.agentName} · {proposal.pageTitle}
                        </CardTitle>
                        <CardDescription>{proposal.summaryVi}</CardDescription>
                        <CardAction>
                          <Badge
                            variant={
                              proposal.status === "stale"
                                ? "destructive"
                                : "secondary"
                            }
                          >
                            {proposal.status === "stale" ? "Đã cũ" : "Đang chờ"}
                          </Badge>
                        </CardAction>
                      </CardHeader>
                      <CardFooter className="justify-between gap-2">
                        <span className="text-muted-foreground">
                          {proposalAge(proposal.ageMs)}
                        </span>
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() =>
                            void onOpenProposal(proposal.pageId, proposal.id)
                          }
                        >
                          Mở và xem trước
                        </Button>
                      </CardFooter>
                    </Card>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Lịch sử chạy theo lịch</CardTitle>
                <CardDescription>
                  Trạng thái và lỗi an toàn của các AgentRun gần đây.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {scheduledRuns.length === 0 && failedDeliveries.length === 0 ? (
                  <Empty>
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <CalendarClock />
                      </EmptyMedia>
                      <EmptyTitle>Chưa có AgentRun theo lịch</EmptyTitle>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  <>
                    {failedDeliveries.map(
                      ({ delivery, agentName, pageTitle }) => (
                        <Card key={delivery.id} size="sm">
                          <CardHeader>
                            <CardTitle>
                              {agentName} · {pageTitle}
                            </CardTitle>
                            <CardDescription>
                              {new Date(delivery.lastAttemptAt).toLocaleString(
                                "vi-VN"
                              )}
                              {` · ${delivery.errorCode ?? "DELIVERY_FAILED"} · lần ${delivery.attemptCount}`}
                            </CardDescription>
                            <CardAction>
                              <Badge variant="destructive">
                                delivery failed
                              </Badge>
                            </CardAction>
                          </CardHeader>
                          <CardFooter className="justify-end">
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() =>
                                void retryScheduleDelivery(delivery.id)
                              }
                            >
                              Chạy lại an toàn
                            </Button>
                          </CardFooter>
                        </Card>
                      )
                    )}
                    {scheduledRuns.slice(0, 10).map((run) => (
                      <Card key={run.id} size="sm">
                        <CardHeader>
                          <CardTitle>{run.agentName}</CardTitle>
                          <CardDescription>
                            {new Date(run.createdAt).toLocaleString("vi-VN")}
                            {run.errorCode ? ` · ${run.errorCode}` : ""}
                          </CardDescription>
                          <CardAction>
                            <Badge
                              variant={
                                run.status === "failed" ||
                                run.status === "step_limit"
                                  ? "destructive"
                                  : "secondary"
                              }
                            >
                              {run.status}
                            </Badge>
                          </CardAction>
                        </CardHeader>
                        {["failed", "cancelled", "step_limit"].includes(
                          run.status
                        ) && (
                          <CardFooter className="justify-end">
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() => void retryScheduledRun(run)}
                            >
                              Chạy lại an toàn
                            </Button>
                          </CardFooter>
                        )}
                      </Card>
                    ))}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Sửa lịch Agent" : "Thêm lịch Agent"}
            </DialogTitle>
            <DialogDescription>
              Một lịch chạy một Agent với một Page và yêu cầu cố định.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveSchedule}>
            <FieldGroup>
              <Field data-disabled={editingId !== null}>
                <FieldLabel>Agent</FieldLabel>
                <Select
                  items={agentItems}
                  value={form.agentId || null}
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      agentId: String(value ?? ""),
                    }))
                  }
                  disabled={editingId !== null}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {agentItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>Page đích</FieldLabel>
                <Select
                  items={pageItems}
                  value={form.pageId}
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      pageId: String(value ?? ""),
                    }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {pageItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="agent-schedule-prompt">Yêu cầu</FieldLabel>
                <Textarea
                  id="agent-schedule-prompt"
                  value={form.prompt}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      prompt: event.target.value,
                    }))
                  }
                  required
                />
              </Field>
              <Field>
                <FieldLabel>Tần suất</FieldLabel>
                <ToggleGroup
                  value={[form.frequency]}
                  onValueChange={(values) => {
                    const frequency = values[0] as
                      "daily" | "weekly" | undefined;
                    if (!frequency) return;
                    setForm((current) => ({
                      ...current,
                      frequency,
                      weekday:
                        frequency === "daily" ? null : (current.weekday ?? 1),
                    }));
                  }}
                  variant="outline"
                >
                  <ToggleGroupItem value="daily">Hàng ngày</ToggleGroupItem>
                  <ToggleGroupItem value="weekly">Hàng tuần</ToggleGroupItem>
                </ToggleGroup>
              </Field>
              {form.frequency === "weekly" && (
                <Field>
                  <FieldLabel>Ngày trong tuần</FieldLabel>
                  <Select
                    items={weekdayItems}
                    value={String(form.weekday ?? 1)}
                    onValueChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        weekday: Number(value),
                      }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {weekdayItems.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              )}
              <Field orientation="responsive">
                <FieldLabel htmlFor="agent-schedule-time">Giờ chạy</FieldLabel>
                <Input
                  id="agent-schedule-time"
                  type="time"
                  value={timeValue(form)}
                  onChange={(event) => {
                    const [localHour, localMinute] = event.target.value
                      .split(":")
                      .map(Number);
                    setForm((current) => ({
                      ...current,
                      localHour,
                      localMinute,
                    }));
                  }}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="agent-schedule-time-zone">
                  Múi giờ
                </FieldLabel>
                <Input
                  id="agent-schedule-time-zone"
                  value={form.timeZone}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      timeZone: event.target.value,
                    }))
                  }
                  required
                />
                <FieldDescription>Ví dụ: Asia/Ho_Chi_Minh</FieldDescription>
              </Field>
              <Field orientation="horizontal">
                <FieldLabel htmlFor="agent-schedule-enabled">
                  Bật lịch ngay
                </FieldLabel>
                <Switch
                  id="agent-schedule-enabled"
                  checked={form.enabled}
                  onCheckedChange={(enabled) =>
                    setForm((current) => ({ ...current, enabled }))
                  }
                />
              </Field>
            </FieldGroup>
            <DialogFooter className="mt-4">
              <Button type="submit" disabled={saving || !form.agentId}>
                {saving && <Spinner data-icon="inline-start" />}
                {saving ? "Đang lưu…" : "Lưu lịch"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
