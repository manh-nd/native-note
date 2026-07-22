import { describe, expect, it } from "vitest";
import { InMemoryAgentSchedulerClient } from "../in-memory-adapter";

describe("AgentSchedulerClient Seam & InMemory Adapter", () => {
  it("allows creating, listing, toggling, and deleting agent schedules", async () => {
    const client = new InMemoryAgentSchedulerClient();

    const created = await client.createSchedule({
      agentId: "agent-1",
      pageId: "page-1",
      prompt: "Summarize weekly notes",
      frequency: "weekly",
      weekday: 1,
      hour: 9,
      minute: 0,
      active: true,
    });

    expect(created.id).toBeDefined();
    expect(created.agentId).toBe("agent-1");
    expect(created.active).toBe(true);

    const list = await client.listSchedules();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(created.id);

    const toggled = await client.toggleSchedule(created.id, false);
    expect(toggled.active).toBe(false);

    const deleted = await client.deleteSchedule(created.id);
    expect(deleted).toBe(true);

    const remaining = await client.listSchedules();
    expect(remaining).toHaveLength(0);
  });
});
