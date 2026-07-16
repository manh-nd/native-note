import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => {
  const state = { selects: [] as unknown[][] };
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
  return { state, db: { select } };
});

const ai = vi.hoisted(() => ({
  generateStructured: vi.fn(),
  getTextModel: vi.fn(() => "test-model"),
}));

const proposals = vi.hoisted(() => ({
  createSkillSelectionRun: vi.fn(),
}));

vi.mock("@/db", () => ({ db: database.db }));
vi.mock("@/lib/ai/gemini", () => ai);
vi.mock("@/packages/document-proposals", () => proposals);
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

import { runSelectionSkill } from "../server";

const policy: {
  inputScope: "selection" | "block" | "page";
  outputMode: "proposal" | "read_only";
  status: "draft" | "disabled";
  allowedTools: string[];
  approvalPolicy: "required";
  showInEditorMenu: boolean;
} = {
  inputScope: "selection",
  outputMode: "proposal",
  status: "draft",
  allowedTools: [],
  approvalPolicy: "required",
  showInEditorMenu: true,
};
const skill = {
  id: "skill-1",
  pageId: "skill-page-1",
  activeVersionId: "version-1",
};
const version = {
  id: "version-1",
  skillId: skill.id,
  version: 3,
  instructionSnapshot: "Rewrite in a friendly, concise voice.",
  policy,
};
const page = {
  id: "page-1",
  contentRevision: 7,
  plainText: "A sentence to improve.",
};
const segments = [
  {
    id: "segment-0",
    text: "A sentence",
    nodeType: "paragraph",
    blockId: "block-1",
    blockFrom: 0,
    blockTo: 10,
  },
];
const output = {
  summaryVi: "Câu văn tự nhiên hơn.",
  segments: [
    {
      id: "segment-0",
      result: "One sentence",
      category: "naturalness" as const,
      explanationVi: "",
      exampleEn: "",
      register: "neutral",
      confidence: 0.9,
    },
  ],
};

function activeSkill(activeVersion = version) {
  database.state.selects.push(
    [{ id: skill.pageId }],
    [skill],
    [version],
    [activeVersion]
  );
}

describe("published selection Skill runs", () => {
  beforeEach(() => {
    database.state.selects = [];
    ai.generateStructured.mockReset().mockResolvedValue(output);
    proposals.createSkillSelectionRun.mockReset();
  });

  it("uses the immutable published version and records a modifying result through a DocumentProposal", async () => {
    activeSkill();
    proposals.createSkillSelectionRun.mockResolvedValue({
      proposal: { id: "proposal-1", operations: { operations: [] } },
      run: { id: "run-1" },
    });

    await expect(
      runSelectionSkill({
        userId: "user-1",
        skillPageId: skill.pageId,
        page: page as never,
        snapshot: "A sentence",
        segments,
      })
    ).resolves.toMatchObject({
      proposalId: "proposal-1",
      runId: "run-1",
      outputMode: "proposal",
    });

    expect(ai.generateStructured).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("A sentence"),
      expect.stringContaining(version.instructionSnapshot)
    );
    expect(proposals.createSkillSelectionRun).toHaveBeenCalledWith(
      expect.objectContaining({
        page: page as never,
        userId: "user-1",
        skillVersion: version,
        model: "test-model",
        snapshot: "A sentence",
        segments: [
          expect.objectContaining({
            result: "One sentence",
            text: "A sentence",
          }),
        ],
      })
    );
  });

  it("returns a read-only result without creating a DocumentProposal", async () => {
    activeSkill({ ...version, policy: { ...policy, outputMode: "read_only" } });
    proposals.createSkillSelectionRun.mockResolvedValue({
      proposal: null,
      run: { id: "run-2" },
    });

    await expect(
      runSelectionSkill({
        userId: "user-1",
        skillPageId: skill.pageId,
        page: page as never,
        snapshot: "A sentence",
        segments,
      })
    ).resolves.toMatchObject({
      proposalId: null,
      runId: "run-2",
      outputMode: "read_only",
      output,
    });
  });

  it("rejects unpublished, inaccessible, and non-selection Skills before calling the model", async () => {
    database.state.selects.push(
      [{ id: skill.pageId }],
      [{ ...skill, activeVersionId: null }],
      []
    );
    await expect(
      runSelectionSkill({
        userId: "user-1",
        skillPageId: skill.pageId,
        page: page as never,
        snapshot: "A sentence",
        segments,
      })
    ).rejects.toMatchObject({ code: "SKILL_UNPUBLISHED" });

    activeSkill({
      ...version,
      policy: { ...policy, allowedTools: ["read-page"] },
    });
    await expect(
      runSelectionSkill({
        userId: "user-1",
        skillPageId: skill.pageId,
        page: page as never,
        snapshot: "A sentence",
        segments,
      })
    ).rejects.toMatchObject({ code: "SKILL_TOOL_INACCESSIBLE" });

    activeSkill({ ...version, policy: { ...policy, inputScope: "block" } });
    await expect(
      runSelectionSkill({
        userId: "user-1",
        skillPageId: skill.pageId,
        page: page as never,
        snapshot: "A sentence",
        segments,
      })
    ).rejects.toMatchObject({ code: "SKILL_SCOPE_UNSUPPORTED" });
    expect(ai.generateStructured).not.toHaveBeenCalled();
  });
});
