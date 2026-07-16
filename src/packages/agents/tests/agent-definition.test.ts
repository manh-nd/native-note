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
  return { state, db: { select, insert, update } };
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

import { z } from "zod";
import { createToolRegistry } from "../index";
import { createAgentDefinition, runAgentDefinition } from "../server";

describe("Agent definitions", () => {
  beforeEach(() => {
    database.state.selects = [];
    database.state.inserts = [];
    database.state.insertValues = [];
    database.state.updates = [];
    database.state.updateValues = [];
  });

  it("persists owned Instructions, published Skills, read-only Tools, model policy, and bounded steps", async () => {
    const created = { id: "agent-1", name: "Coach" };
    database.state.selects.push(
      [{ id: "instructions-1" }],
      [{ id: "version-1" }]
    );
    database.state.inserts.push([created]);

    await expect(
      createAgentDefinition({
        userId: "user-1",
        name: "Coach",
        instructionsPageId: "instructions-1",
        skillVersionIds: ["version-1"],
        allowedTools: ["read_current_page", "search_learning_memory"],
        modelPolicy: { model: "model-1" },
        maxSteps: 4,
      })
    ).resolves.toEqual(created);
    expect(database.state.insertValues[0]).toMatchObject({
      creatorId: "user-1",
      instructionsPageId: "instructions-1",
      skillVersionIds: ["version-1"],
      allowedTools: ["read_current_page", "search_learning_memory"],
      modelPolicy: { model: "model-1" },
      maxSteps: 4,
    });
  });

  it("rejects inaccessible Skill versions and Tools before persistence", async () => {
    database.state.selects.push([{ id: "instructions-1" }], []);
    await expect(
      createAgentDefinition({
        userId: "user-1",
        name: "Coach",
        instructionsPageId: "instructions-1",
        skillVersionIds: ["other-version"],
        allowedTools: ["read_current_page"],
        modelPolicy: { model: "model-1" },
        maxSteps: 2,
      })
    ).rejects.toMatchObject({ code: "AGENT_SKILL_INACCESSIBLE" });

    database.state.selects.push([{ id: "instructions-1" }]);
    await expect(
      createAgentDefinition({
        userId: "user-1",
        name: "Coach",
        instructionsPageId: "instructions-1",
        skillVersionIds: [],
        allowedTools: ["create_proposal"],
        modelPolicy: { model: "model-1" },
        maxSteps: 2,
      })
    ).rejects.toMatchObject({ code: "AGENT_TOOL_INACCESSIBLE" });
    expect(database.state.insertValues).toHaveLength(0);
  });

  it("persists configuration snapshots, redacted ToolCall audits, and the terminal run", async () => {
    const agent = {
      id: "agent-1",
      name: "Coach",
      skillVersionIds: ["version-1"],
      allowedTools: ["read_current_page"],
      modelPolicy: { model: "model-1" },
      maxSteps: 2,
    };
    database.state.selects.push(
      [
        {
          agent,
          instructionsPageId: "instructions-1",
          instructionsContentRevision: 4,
          instructionsSnapshot: "Read only.",
        },
      ],
      [{ id: "page-1" }],
      [
        {
          id: "version-1",
          version: 3,
          instructionSnapshot: "Be concise.",
        },
      ]
    );
    database.state.inserts.push([{ id: "run-1" }], []);
    database.state.updates.push([
      { id: "run-1", status: "completed", output: "Looks good." },
    ]);
    const registry = createToolRegistry([
      {
        name: "read_current_page",
        description: "Read the current Page.",
        inputSchema: z.object({ apiKey: z.string() }).strict(),
        outputSchema: z.object({ text: z.string() }),
        ownership: "current_user",
        risk: "low",
        approval: "not_required",
        authorize: async () => true,
        execute: async () => ({ text: "Draft" }),
      },
    ]);
    const model = vi
      .fn()
      .mockResolvedValueOnce({
        text: null,
        calls: [
          {
            id: "provider-call-1",
            name: "read_current_page",
            input: { apiKey: "secret" },
          },
        ],
      })
      .mockResolvedValueOnce({ text: "Looks good.", calls: [] });

    await expect(
      runAgentDefinition({
        userId: "user-1",
        agentId: "agent-1",
        pageId: "page-1",
        prompt: "Review this Page.",
        model,
        registry,
      })
    ).resolves.toMatchObject({ status: "completed", output: "Looks good." });

    expect(database.state.insertValues[0]).toMatchObject({
      agentSnapshot: expect.objectContaining({
        instructions: {
          pageId: "instructions-1",
          contentRevision: 4,
          snapshot: "Read only.",
        },
        skillVersions: [
          expect.objectContaining({ id: "version-1", version: 3 }),
        ],
        modelPolicy: { model: "model-1" },
      }),
      toolSnapshots: [expect.objectContaining({ name: "read_current_page" })],
    });
    expect(database.state.insertValues[1]).toMatchObject({
      agentRunId: "run-1",
      providerCallId: "provider-call-1",
      input: { apiKey: "[REDACTED]" },
      output: { text: "Draft" },
      failureCode: null,
    });
    expect(database.state.updateValues[0]).toMatchObject({
      status: "completed",
      output: "Looks good.",
      stepCount: 2,
      errorCode: null,
    });
  });
});
