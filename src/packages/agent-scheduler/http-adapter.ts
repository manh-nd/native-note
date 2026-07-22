import type {
  AgentScheduleRow,
  AgentSchedulerClient,
  CreateAgentScheduleInput,
} from "./types";

export class HttpAgentSchedulerClient implements AgentSchedulerClient {
  async listSchedules(): Promise<AgentScheduleRow[]> {
    const res = await fetch("/api/agents/schedules");
    if (!res.ok) throw new Error("Failed to fetch agent schedules");
    const json = await res.json();
    return json.data ?? [];
  }

  async createSchedule(
    input: CreateAgentScheduleInput
  ): Promise<AgentScheduleRow> {
    const res = await fetch("/api/agents/schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error("Failed to create agent schedule");
    const json = await res.json();
    return json.data;
  }

  async toggleSchedule(id: string, active: boolean): Promise<AgentScheduleRow> {
    const res = await fetch(`/api/agents/schedules/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    if (!res.ok) throw new Error("Failed to toggle agent schedule");
    const json = await res.json();
    return json.data;
  }

  async deleteSchedule(id: string): Promise<boolean> {
    const res = await fetch(`/api/agents/schedules/${id}`, {
      method: "DELETE",
    });
    return res.ok;
  }
}
