import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => {
  const state = {
    selects: [] as unknown[][],
    inserts: [] as unknown[][],
    insertValues: [] as unknown[],
    updates: [] as unknown[][],
    updateCalls: 0,
  };
  const select = () => {
    const rows = state.selects.shift() ?? [];
    const query = {
      from: () => query,
      innerJoin: () => query,
      where: () => query,
      for: () => query,
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
      set: () => query,
      where: () => query,
      returning: () => {
        state.updateCalls += 1;
        return Promise.resolve(rows);
      },
    };
    return query;
  };
  const connection = {
    select,
    insert,
    update,
    delete: () => ({ where: () => Promise.resolve() }),
  };
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
  activateSkillVersion,
  publishSkillVersion,
  unmarkPageAsSkill,
} from "../server";

const skill = {
  id: "skill-1",
  pageId: "page-1",
  creatorId: "user-1",
  inputScope: "selection",
  outputMode: "proposal",
  status: "draft",
  allowedTools: [],
  approvalPolicy: "required",
  showInEditorMenu: true,
  activeVersionId: "version-1",
};
const page = {
  id: "page-1",
  contentRevision: 3,
  content: {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Keep the active instructions." }],
      },
    ],
  },
};
const version = {
  id: "version-1",
  skillId: "skill-1",
  version: 1,
  instructionSnapshot: "Keep the active instructions.",
  policy: {
    inputScope: "selection",
    outputMode: "proposal",
    status: "draft",
    allowedTools: [],
    approvalPolicy: "required",
    showInEditorMenu: true,
  },
  compilerVersion: "1",
  sourceContentRevision: 3,
  publishedBy: "user-1",
};

describe("published Skill version lifecycle", () => {
  beforeEach(() => {
    database.state.selects = [];
    database.state.inserts = [];
    database.state.insertValues = [];
    database.state.updates = [];
    database.state.updateCalls = 0;
  });

  it("returns the active immutable version without writing again when publishing an unchanged draft", async () => {
    database.state.selects.push(
      [{ id: page.id }],
      [{ skill, page }],
      [version]
    );

    await expect(publishSkillVersion("user-1", page.id)).resolves.toEqual({
      skill,
      version,
      published: false,
    });
    expect(database.state.updateCalls).toBe(0);
  });

  it("records the current draft and normalized policy in a new immutable version", async () => {
    const unpublishedSkill = { ...skill, activeVersionId: null };
    const activatedSkill = { ...skill, activeVersionId: version.id };
    database.state.selects.push(
      [{ id: page.id }],
      [{ skill: unpublishedSkill, page }],
      []
    );
    database.state.inserts.push([version]);
    database.state.updates.push([activatedSkill]);

    await expect(publishSkillVersion("user-1", page.id)).resolves.toEqual({
      skill: activatedSkill,
      version,
      published: true,
    });
    expect(database.state.insertValues).toContainEqual(
      expect.objectContaining({
        instructionSnapshot: "Keep the active instructions.",
        policy: version.policy,
        compilerVersion: "1",
        sourceContentRevision: 3,
      })
    );
  });

  it("rejects a draft that requests inaccessible Tools", async () => {
    database.state.selects.push(
      [{ id: page.id }],
      [{ skill: { ...skill, allowedTools: ["read-page"] }, page }]
    );

    await expect(publishSkillVersion("user-1", page.id)).rejects.toMatchObject({
      code: "SKILL_TOOL_INACCESSIBLE",
    });
  });

  it("does not mutate the active version when a rollback is retried", async () => {
    database.state.selects.push([{ id: page.id }], [skill], [version]);

    await expect(
      activateSkillVersion("user-1", page.id, version.id)
    ).resolves.toEqual({ skill, version, activated: false });
    expect(database.state.updateCalls).toBe(0);
  });

  it("keeps immutable version history when a user tries to unmark a published Skill", async () => {
    database.state.selects.push(
      [{ id: page.id }],
      [skill],
      [{ id: version.id }]
    );

    await expect(unmarkPageAsSkill("user-1", page.id)).rejects.toMatchObject({
      code: "SKILL_VERSION_HISTORY_EXISTS",
    });
  });
});
