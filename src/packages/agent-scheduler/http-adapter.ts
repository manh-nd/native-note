import type {
  AgentScheduleRow,
  AgentSchedulerClient,
  CreateAgentScheduleInput,
} from "./types";

export class HttpAgentSchedulerClient implements AgentSchedulerClient {
  async listSchedules(): Promise<AgentScheduleRow[]> {
    const res = await fetch("/api/agent-schedules");
    if (!res.ok) throw new Error("Failed to fetch agent schedules");
    const json = await res.json();
    const list = json.schedules ?? json.data ?? [];
    return list.map((item: any) => item.schedule ?? item);
  }

  async createSchedule(
    input: CreateAgentScheduleInput
  ): Promise<AgentScheduleRow> {
    const res = await fetch("/api/agent-schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...input,
        enabled: input.active ?? true,
      }),
    });
    if (!res.ok) throw new Error("Failed to create agent schedule");
    const json = await res.json();
    return json.schedule ?? json.data;
  }

  async toggleSchedule(id: string, active: boolean): Promise<AgentScheduleRow> {
    const res = await fetch(`/api/agent-schedules/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: active, active }),
    });
    if (!res.ok) throw new Error("Failed to toggle agent schedule");
    const json = await res.json();
    return json.schedule ?? json.data ?? { id, active };
  }

  async deleteSchedule(id: string): Promise<boolean> {
    const res = await fetch(`/api/agent-schedules/${id}`, {
      method: "DELETE",
    });
    return res.ok;
  }
}
