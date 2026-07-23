import { describe, expect, it, vi } from "vitest";
import { AgentSchedulerEngine, isTransientError } from "../scheduler-engine";
import type { AgentScheduleRow } from "../types";

describe("AgentSchedulerEngine & Exponential Backoff Retry", () => {
  const mockSchedule: AgentScheduleRow = {
    id: "sched-1",
    agentId: "agent-1",
    pageId: "page-1",
    prompt: "Generate daily summary",
    frequency: "daily",
    weekday: null,
    hour: 9,
    minute: 0,
    active: true,
  };

  it("identifies transient vs non-transient errors correctly", () => {
    expect(isTransientError(new Error("429 Rate Limit Exceeded"))).toBe(true);
    expect(isTransientError(new Error("500 Internal Server Error"))).toBe(true);
    expect(isTransientError(new Error("Network timeout"))).toBe(true);

    expect(isTransientError(new Error("400 Bad Request"))).toBe(false);
    expect(isTransientError(new Error("404 Not Found"))).toBe(false);
  });

  it("executes successfully on the first attempt", async () => {
    const engine = new AgentSchedulerEngine({
      maxRetries: 3,
      initialBackoffMs: 1,
    });
    const runner = vi.fn().mockResolvedValue({ success: true });

    const result = await engine.executeSchedule(mockSchedule, runner);

    expect(result.status).toBe("completed");
    expect(result.attempts).toBe(1);
    expect(result.result).toEqual({ success: true });
    expect(runner).toHaveBeenCalledTimes(1);
  });

  it("retries transient errors with exponential backoff and succeeds", async () => {
    const engine = new AgentSchedulerEngine({
      maxRetries: 3,
      initialBackoffMs: 1,
    });
    const runner = vi
      .fn()
      .mockRejectedValueOnce(new Error("429 Rate Limit Exceeded"))
      .mockRejectedValueOnce(new Error("500 Server Error"))
      .mockResolvedValue({ success: true });

    const statusHistory: string[] = [];
    engine.onStatusChange((status) => statusHistory.push(status));

    const result = await engine.executeSchedule(mockSchedule, runner);

    expect(result.status).toBe("completed");
    expect(result.attempts).toBe(3);
    expect(result.result).toEqual({ success: true });
    expect(runner).toHaveBeenCalledTimes(3);
    expect(statusHistory).toEqual([
      "executing",
      "retrying",
      "executing",
      "retrying",
      "executing",
      "completed",
    ]);
  });

  it("fails immediately on non-transient errors without retrying", async () => {
    const engine = new AgentSchedulerEngine({
      maxRetries: 3,
      initialBackoffMs: 1,
    });
    const runner = vi.fn().mockRejectedValue(new Error("400 Bad Request"));

    const result = await engine.executeSchedule(mockSchedule, runner);

    expect(result.status).toBe("failed");
    expect(result.attempts).toBe(1);
    expect(result.error).toContain("400 Bad Request");
    expect(runner).toHaveBeenCalledTimes(1);
  });

  it("stops and marks failed after exceeding max retries for transient errors", async () => {
    const engine = new AgentSchedulerEngine({
      maxRetries: 3,
      initialBackoffMs: 1,
    });
    const runner = vi
      .fn()
      .mockRejectedValue(new Error("503 Service Unavailable"));

    const result = await engine.executeSchedule(mockSchedule, runner);

    expect(result.status).toBe("failed");
    expect(result.attempts).toBe(3);
    expect(result.error).toContain("503 Service Unavailable");
    expect(runner).toHaveBeenCalledTimes(3);
  });
});
