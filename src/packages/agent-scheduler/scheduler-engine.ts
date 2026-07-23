import type { AgentScheduleRow, ScheduledRunStatus } from "./types";

export type AgentSchedulerEngineOptions = {
  maxRetries?: number;
  initialBackoffMs?: number;
};

export type ExecutionResult<T = unknown> = {
  status: ScheduledRunStatus;
  attempts: number;
  result?: T;
  error?: string;
};

export function isTransientError(error: unknown): boolean {
  if (!error) return false;
  const msg = error instanceof Error ? error.message : String(error);
  const statusMatch = msg.match(/\b(429|500|502|503|504)\b/);
  if (statusMatch) return true;

  const lowerMsg = msg.toLowerCase();
  if (
    lowerMsg.includes("rate limit") ||
    lowerMsg.includes("quota") ||
    lowerMsg.includes("timeout") ||
    lowerMsg.includes("network")
  ) {
    return true;
  }

  return false;
}

export class AgentSchedulerEngine {
  private maxRetries: number;
  private initialBackoffMs: number;
  private statusListeners: Array<(status: ScheduledRunStatus) => void> = [];

  constructor(options: AgentSchedulerEngineOptions = {}) {
    this.maxRetries = options.maxRetries ?? 3;
    this.initialBackoffMs = options.initialBackoffMs ?? 1000;
  }

  onStatusChange(listener: (status: ScheduledRunStatus) => void): () => void {
    this.statusListeners.push(listener);
    return () => {
      this.statusListeners = this.statusListeners.filter((l) => l !== listener);
    };
  }

  private notifyStatusChange(status: ScheduledRunStatus): void {
    for (const listener of this.statusListeners) {
      listener(status);
    }
  }

  async executeSchedule<T>(
    schedule: AgentScheduleRow,
    runner: (schedule: AgentScheduleRow) => Promise<T>
  ): Promise<ExecutionResult<T>> {
    let attempts = 0;

    while (attempts < this.maxRetries) {
      attempts++;
      this.notifyStatusChange("executing");

      try {
        const result = await runner(schedule);
        this.notifyStatusChange("completed");
        return {
          status: "completed",
          attempts,
          result,
        };
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        const transient = isTransientError(err);

        if (!transient || attempts >= this.maxRetries) {
          this.notifyStatusChange("failed");
          return {
            status: "failed",
            attempts,
            error: errorMessage,
          };
        }

        this.notifyStatusChange("retrying");
        const delay = this.initialBackoffMs * Math.pow(2, attempts - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    this.notifyStatusChange("failed");
    return {
      status: "failed",
      attempts,
      error: "Max retries exceeded",
    };
  }
}
