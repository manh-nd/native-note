import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => {
  const state = {
    selects: [] as unknown[][],
    inserts: [] as unknown[][],
    insertValues: [] as unknown[],
    updates: [] as unknown[][],
    updateValues: [] as unknown[],
  };
  const select = () => {
    const rows = state.selects.shift() ?? [];
    const query = {
      from: () => query,
      innerJoin: () => query,
      leftJoin: () => query,
      where: () => query,
      orderBy: () => query,
      for: () => query,
      limit: () => Promise.resolve(rows),
      then: Promise.resolve(rows).then.bind(Promise.resolve(rows)),
    };
    return query;
  };
  const insert = () => {
    const rows = state.inserts.shift() ?? [];
    const query = {
      values: (value: unknown) => {
        state.insertValues.push(value);
        return query;
      },
      onConflictDoNothing: () => query,
      returning: () => Promise.resolve(rows),
    };
    return query;
  };
  const update = () => {
    const rows = state.updates.shift() ?? [];
    const query = {
      set: (value: unknown) => {
        state.updateValues.push(value);
        return query;
      },
      where: () => query,
      returning: () => Promise.resolve(rows),
    };
    return query;
  };
  const connection = { select, insert, update };
  return {
    state,
    db: {
      ...connection,
      transaction: async <T>(run: (tx: typeof connection) => Promise<T>) =>
        run(connection),
    },
  };
});

vi.mock("@/db", () => ({ db: database.db }));
vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      message: string,
      public code = "REQUEST_FAILED"
    ) {
      super(message);
    }
  },
}));

import {
  createAgentSchedule,
  dispatchDueAgentSchedules,
  listFailedScheduleDeliveries,
  nextAgentScheduleOccurrence,
  retryFailedScheduleDelivery,
  retryFailedScheduleDeliveries,
  updateAgentSchedule,
} from "../schedules";
import {
  CREATE_DOCUMENT_PROPOSAL_TOOL,
  createInitialToolRegistry,
  runAgent,
} from "../index";
import {
  acceptDocumentProposal,
  createAgentDocumentProposal,
  loadScheduledProposalInbox,
} from "@/packages/document-proposals";

beforeEach(() => {
  database.state.selects = [];
  database.state.inserts = [];
  database.state.insertValues = [];
  database.state.updates = [];
  database.state.updateValues = [];
});

describe("AgentSchedule cadence", () => {
  it("finds the next daily occurrence in the schedule's time zone", () => {
    expect(
      nextAgentScheduleOccurrence(
        {
          frequency: "daily",
          weekday: null,
          localHour: 9,
          localMinute: 30,
          timeZone: "Asia/Ho_Chi_Minh",
        },
        new Date("2026-07-16T03:00:00.000Z")
      )
    ).toEqual(new Date("2026-07-17T02:30:00.000Z"));
  });

  it("finds the next weekly occurrence without replaying missed intervals", () => {
    expect(
      nextAgentScheduleOccurrence(
        {
          frequency: "weekly",
          weekday: 1,
          localHour: 8,
          localMinute: 0,
          timeZone: "UTC",
        },
        new Date("2026-07-20T08:00:00.000Z")
      )
    ).toEqual(new Date("2026-07-27T08:00:00.000Z"));
  });

  it("rejects an unknown IANA time zone", () => {
    expect(() =>
      nextAgentScheduleOccurrence(
        {
          frequency: "daily",
          weekday: null,
          localHour: 9,
          localMinute: 0,
          timeZone: "Mars/Olympus",
        },
        new Date("2026-07-16T00:00:00.000Z")
      )
    ).toThrow("time zone");
  });
});

describe("AgentSchedule configuration", () => {
  it("creates an enabled schedule only for an owned Agent and target Page", async () => {
    const created = { id: "schedule-1", enabled: true };
    database.state.selects.push([{ agentId: "agent-1", pageId: "page-1" }]);
    database.state.inserts.push([created]);

    await expect(
      createAgentSchedule({
        userId: "user-1",
        agentId: "agent-1",
        pageId: "page-1",
        prompt: "Review this Page.",
        frequency: "daily",
        weekday: null,
        localHour: 9,
        localMinute: 30,
        timeZone: "Asia/Ho_Chi_Minh",
        enabled: true,
        now: new Date("2026-07-16T03:00:00.000Z"),
      })
    ).resolves.toEqual(created);
    expect(database.state.insertValues[0]).toMatchObject({
      creatorId: "user-1",
      agentId: "agent-1",
      pageId: "page-1",
      prompt: "Review this Page.",
      enabled: true,
      nextRunAt: new Date("2026-07-17T02:30:00.000Z"),
    });
  });

  it("disables and reconfigures only an owned schedule", async () => {
    const updated = { id: "schedule-1", enabled: false, nextRunAt: null };
    database.state.selects.push(
      [{ id: "schedule-1", agentId: "agent-1" }],
      [{ agentId: "agent-1", pageId: "page-2" }]
    );
    database.state.updates.push([updated]);

    await expect(
      updateAgentSchedule({
        userId: "user-1",
        scheduleId: "schedule-1",
        pageId: "page-2",
        prompt: "Check this Page weekly.",
        frequency: "weekly",
        weekday: 5,
        localHour: 17,
        localMinute: 0,
        timeZone: "Asia/Ho_Chi_Minh",
        enabled: false,
        now: new Date("2026-07-16T03:00:00.000Z"),
      })
    ).resolves.toEqual(updated);
    expect(database.state.updateValues[0]).toMatchObject({
      pageId: "page-2",
      prompt: "Check this Page weekly.",
      weekday: 5,
      enabled: false,
      nextRunAt: null,
    });
  });
});

describe("AgentSchedule delivery", () => {
  it("coalesces a due schedule into one idempotent scheduled AgentRun", async () => {
    const dueAt = new Date("2026-07-15T02:30:00.000Z");
    const schedule = {
      id: "schedule-1",
      creatorId: "user-1",
      agentId: "agent-1",
      pageId: "page-1",
      prompt: "Review this Page.",
      frequency: "daily" as const,
      weekday: null,
      localHour: 9,
      localMinute: 30,
      timeZone: "Asia/Ho_Chi_Minh",
      nextRunAt: dueAt,
    };
    database.state.selects.push([schedule]);
    database.state.inserts.push([{ id: "delivery-1" }]);
    database.state.updates.push([], []);
    const executeRun = vi.fn().mockResolvedValue({
      id: "run-1",
      status: "completed",
    });

    await expect(
      dispatchDueAgentSchedules({
        now: new Date("2026-07-16T03:00:00.000Z"),
        executeRun,
      })
    ).resolves.toEqual({ claimed: 1, delivered: 1 });
    expect(database.state.insertValues[0]).toMatchObject({
      scheduleId: "schedule-1",
      dueAt,
    });
    expect(database.state.updateValues[0]).toMatchObject({
      nextRunAt: new Date("2026-07-17T02:30:00.000Z"),
    });
    expect(executeRun).toHaveBeenCalledWith({
      userId: "user-1",
      agentId: "agent-1",
      pageId: "page-1",
      prompt: "Review this Page.",
      scheduleDeliveryId: "delivery-1",
    });
    expect(database.state.updateValues[1]).toMatchObject({
      status: "completed",
    });
  });

  it("does not execute a duplicate delivery", async () => {
    database.state.selects.push([
      {
        id: "schedule-1",
        creatorId: "user-1",
        agentId: "agent-1",
        pageId: "page-1",
        prompt: "Review this Page.",
        frequency: "daily",
        weekday: null,
        localHour: 9,
        localMinute: 30,
        timeZone: "UTC",
        nextRunAt: new Date("2026-07-16T09:30:00.000Z"),
      },
    ]);
    database.state.inserts.push([]);
    database.state.updates.push([]);
    const executeRun = vi.fn();

    await expect(
      dispatchDueAgentSchedules({
        now: new Date("2026-07-16T10:00:00.000Z"),
        executeRun,
      })
    ).resolves.toEqual({ claimed: 0, delivered: 0 });
    expect(executeRun).not.toHaveBeenCalled();
  });

  it("reclaims an abandoned ScheduleDelivery without creating a duplicate AgentRun", async () => {
    database.state.selects.push([
      {
        delivery: {
          id: "delivery-1",
          creatorId: "user-1",
          agentId: "agent-1",
          pageId: "11111111-1111-4111-8111-111111111111",
          promptSnapshot: "Review this Page.",
          status: "claimed",
          attemptCount: 1,
          lastAttemptAt: new Date("2026-07-16T09:00:00.000Z"),
        },
      },
    ]);
    database.state.updates.push([{ id: "delivery-1" }], []);
    const executeRun = vi.fn().mockResolvedValue({
      id: "run-1",
      status: "completed",
    });

    await expect(
      retryFailedScheduleDeliveries({
        now: new Date("2026-07-16T10:00:00.000Z"),
        executeRun,
      })
    ).resolves.toEqual({ claimed: 1, delivered: 1 });
    expect(executeRun).toHaveBeenCalledWith({
      userId: "user-1",
      agentId: "agent-1",
      pageId: "11111111-1111-4111-8111-111111111111",
      prompt: "Review this Page.",
      scheduleDeliveryId: "delivery-1",
    });
    expect(database.state.updateValues[0]).toMatchObject({
      status: "claimed",
      attemptCount: 2,
      lastAttemptAt: new Date("2026-07-16T10:00:00.000Z"),
    });
  });

  it("keeps exhausted pre-run delivery failures visible and manually retryable", async () => {
    const delivery = {
      id: "delivery-1",
      creatorId: "user-1",
      agentId: "agent-1",
      pageId: "11111111-1111-4111-8111-111111111111",
      promptSnapshot: "Review this Page.",
      status: "failed" as const,
      attemptCount: 3,
      lastAttemptAt: new Date("2026-07-16T09:00:00.000Z"),
    };
    database.state.selects.push(
      [{ delivery, agentName: "Coach", pageTitle: "Draft" }],
      [{ delivery, agentRunId: null }]
    );
    database.state.updates.push([{ id: "delivery-1" }], []);
    const executeRun = vi.fn().mockResolvedValue({
      id: "run-1",
      status: "completed",
    });

    await expect(listFailedScheduleDeliveries("user-1")).resolves.toEqual([
      { delivery, agentName: "Coach", pageTitle: "Draft" },
    ]);
    await expect(
      retryFailedScheduleDelivery({
        userId: "user-1",
        deliveryId: "delivery-1",
        now: new Date("2026-07-16T10:00:00.000Z"),
        executeRun,
      })
    ).resolves.toEqual({ claimed: true, delivered: true });
    expect(database.state.updateValues[0]).toMatchObject({
      status: "claimed",
      attemptCount: 4,
    });
    expect(executeRun).toHaveBeenCalledWith(
      expect.objectContaining({ scheduleDeliveryId: "delivery-1" })
    );
  });

  it("runs a scheduled Agent into its owned inbox and changes the Page only after acceptance", async () => {
    const content = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { blockId: "block-1" },
          content: [{ type: "text", text: "I has a plan." }],
        },
      ],
    };
    database.state.selects.push(
      [
        {
          id: "schedule-1",
          creatorId: "user-1",
          agentId: "agent-1",
          pageId: "page-1",
          prompt: "Review this Page.",
          frequency: "daily",
          weekday: null,
          localHour: 9,
          localMinute: 30,
          timeZone: "UTC",
          nextRunAt: new Date("2026-07-16T09:30:00.000Z"),
        },
      ],
      [],
      [
        {
          page: {
            id: "11111111-1111-4111-8111-111111111111",
            contentRevision: 4,
            content,
          },
        },
      ]
    );
    database.state.inserts.push(
      [{ id: "delivery-1" }],
      [
        {
          id: "44444444-4444-4444-8444-444444444444",
          pageId: "11111111-1111-4111-8111-111111111111",
          baseContentRevision: 4,
          status: "pending",
        },
      ]
    );
    database.state.updates.push([], []);

    const result = await dispatchDueAgentSchedules({
      now: new Date("2026-07-16T10:00:00.000Z"),
      executeRun: async ({ scheduleDeliveryId }) => {
        const tools = createInitialToolRegistry({
          createDocumentProposal: createAgentDocumentProposal,
        });
        const model = vi
          .fn()
          .mockResolvedValueOnce({
            text: null,
            calls: [
              {
                id: "provider-call-1",
                name: CREATE_DOCUMENT_PROPOSAL_TOOL,
                input: {
                  baseContentRevision: 4,
                  summary: "Fix the verb.",
                  operations: [
                    {
                      type: "replace-text",
                      target: {
                        blockId: "block-1",
                        expectedText: "I has a plan.",
                        from: 2,
                        to: 5,
                      },
                      text: "have",
                    },
                  ],
                },
              },
            ],
          })
          .mockResolvedValueOnce({ text: "Proposal is ready.", calls: [] });
        const run = await runAgent({
          definition: {
            id: "agent-1",
            name: "Coach",
            instructions: {
              pageId: "instructions-1",
              contentRevision: 1,
              snapshot: "Review the Page.",
            },
            skillVersions: [],
            allowedTools: [CREATE_DOCUMENT_PROPOSAL_TOOL],
            modelPolicy: { model: "model-1" },
            maxSteps: 2,
          },
          prompt: "Review this Page.",
          context: {
            userId: "user-1",
            currentPageId: "11111111-1111-4111-8111-111111111111",
          },
          provenance: {
            sourceRunId: "source-run-1",
            agentRunId: "run-1",
            idempotencyScopeId: "run-1",
          },
          tools,
          model,
          audit: async () => undefined,
        });
        expect(scheduleDeliveryId).toBe("delivery-1");
        expect(run).toMatchObject({
          status: "completed",
          output: "Proposal is ready.",
        });
        return { id: "run-1", status: run.status };
      },
    });

    expect(result).toEqual({ claimed: 1, delivered: 1 });
    expect(database.state.insertValues[1]).toMatchObject({
      pageId: "11111111-1111-4111-8111-111111111111",
      sourceRunId: "source-run-1",
    });
    expect(database.state.updateValues).not.toContainEqual(
      expect.objectContaining({ content })
    );

    const proposal = {
      id: "44444444-4444-4444-8444-444444444444",
      creatorId: "user-1",
      pageId: "11111111-1111-4111-8111-111111111111",
      baseContentRevision: 4,
      operations: {
        baseContentRevision: 4,
        operations: [
          {
            type: "replace-text" as const,
            target: {
              blockId: "block-1",
              expectedText: "I has a plan.",
              from: 2,
              to: 5,
            },
            text: "have",
          },
        ],
      },
      summaryVi: "Fix the verb.",
      status: "pending" as const,
      createdAt: new Date("2026-07-16T09:30:00.000Z"),
    };
    const page = {
      id: proposal.pageId,
      title: "Draft",
      contentRevision: 4,
      content,
    };
    database.state.selects.push([
      {
        proposal,
        page,
        agentId: "agent-1",
        agentName: "Coach",
        agentPrompt: "Review this Page.",
      },
    ]);
    await expect(
      loadScheduledProposalInbox("user-1", new Date("2026-07-16T10:00:00.000Z"))
    ).resolves.toEqual([
      expect.objectContaining({
        id: proposal.id,
        pageTitle: "Draft",
        agentName: "Coach",
        status: "pending",
      }),
    ]);
    expect(database.state.updateValues).not.toContainEqual(
      expect.objectContaining({ content: expect.anything() })
    );

    const acceptedPage = {
      ...page,
      contentRevision: 5,
      content: {
        ...content,
        content: [
          {
            ...content.content[0],
            content: [{ type: "text", text: "I have a plan." }],
          },
        ],
      },
    };
    database.state.selects.push([{ proposal, page }], []);
    database.state.updates.push(
      [acceptedPage],
      [{ ...proposal, status: "accepted" }]
    );
    await expect(
      acceptDocumentProposal("user-1", proposal.id)
    ).resolves.toMatchObject({
      page: acceptedPage,
      proposal: { status: "accepted" },
    });
    expect(database.state.updateValues).toContainEqual(
      expect.objectContaining({
        content: expect.objectContaining({
          content: [
            expect.objectContaining({
              content: [{ type: "text", text: "I have a plan." }],
            }),
          ],
        }),
      })
    );
  });
});
