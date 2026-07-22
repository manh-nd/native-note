import type {
  AgentScheduleRow,
  AgentSchedulerClient,
  CreateAgentScheduleInput,
} from "./types";

export class InMemoryAgentSchedulerClient implements AgentSchedulerClient {
  private schedules = new Map<string, AgentScheduleRow>();
  private nextId = 1;

  async listSchedules(): Promise<AgentScheduleRow[]> {
    return Array.from(this.schedules.values());
  }

  async createSchedule(
    input: CreateAgentScheduleInput
  ): Promise<AgentScheduleRow> {
    const id = `sched-${this.nextId++}`;
    const row: AgentScheduleRow = {
      id,
      agentId: input.agentId,
      pageId: input.pageId,
      prompt: input.prompt,
      frequency: input.frequency,
      weekday: input.weekday ?? null,
      hour: input.hour,
      minute: input.minute,
      active: input.active ?? true,
      lastRunAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.schedules.set(id, row);
    return row;
  }

  async toggleSchedule(id: string, active: boolean): Promise<AgentScheduleRow> {
    const existing = this.schedules.get(id);
    if (!existing) throw new Error(`Schedule ${id} not found`);
    const updated: AgentScheduleRow = {
      ...existing,
      active,
      updatedAt: new Date(),
    };
    this.schedules.set(id, updated);
    return updated;
  }

  async deleteSchedule(id: string): Promise<boolean> {
    return this.schedules.delete(id);
  }
}
