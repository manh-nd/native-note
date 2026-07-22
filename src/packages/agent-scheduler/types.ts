export type ScheduledRunStatus =
  "pending" | "executing" | "completed" | "failed" | "retrying";

export type AgentScheduleRow = {
  id: string;
  agentId: string;
  pageId: string;
  prompt: string;
  frequency: "daily" | "weekly";
  weekday: number | null;
  hour: number;
  minute: number;
  active: boolean;
  lastRunAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
};

export type CreateAgentScheduleInput = {
  agentId: string;
  pageId: string;
  prompt: string;
  frequency: "daily" | "weekly";
  weekday?: number | null;
  hour: number;
  minute: number;
  active?: boolean;
};

export interface AgentSchedulerClient {
  listSchedules(): Promise<AgentScheduleRow[]>;
  createSchedule(input: CreateAgentScheduleInput): Promise<AgentScheduleRow>;
  toggleSchedule(id: string, active: boolean): Promise<AgentScheduleRow>;
  deleteSchedule(id: string): Promise<boolean>;
}
