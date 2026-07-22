import { describe, expect, it, vi } from "vitest";

vi.mock("@/packages/document-proposals", () => ({
  createAgentDocumentProposal: vi.fn(),
}));

import {
  CREATE_DOCUMENT_PROPOSAL_TOOL,
  createInitialToolRegistry,
} from "../index";

const context = {
  userId: "user-1",
  currentPageId: "11111111-1111-4111-8111-111111111111",
  provenance: {
    sourceRunId: "22222222-2222-4222-8222-222222222222",
    agentRunId: "33333333-3333-4333-8333-333333333333",
    providerToolCallId: "provider-call-1",
    idempotencyKey: "idempotency-1",
    idempotencyScopeId: "33333333-3333-4333-8333-333333333333",
  },
};

const input = {
  baseContentRevision: 4,
  summary: "Improve the opening sentence.",
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
};

describe("create DocumentProposal Agent Tool", () => {
  it("submits a validated pending proposal with AgentRun and ToolCall provenance", async () => {
    const createDocumentProposal = vi.fn(async () => ({
      proposalId: "44444444-4444-4444-8444-444444444444",
      pageId: context.currentPageId,
      baseContentRevision: 4,
      status: "pending" as const,
    }));
    const tools = createInitialToolRegistry({ createDocumentProposal });
    const transaction = {} as never;

    await expect(
      tools.execute(
        CREATE_DOCUMENT_PROPOSAL_TOOL,
        input,
        context,
        [CREATE_DOCUMENT_PROPOSAL_TOOL],
        { transaction }
      )
    ).resolves.toMatchObject({
      output: {
        proposalId: "44444444-4444-4444-8444-444444444444",
        status: "pending",
      },
      snapshot: { risk: "medium", approval: "not_required" },
    });
    expect(createDocumentProposal).toHaveBeenCalledWith(
      {
        userId: "user-1",
        pageId: context.currentPageId,
        sourceRunId: context.provenance.sourceRunId,
        agentRunId: context.provenance.agentRunId,
        providerToolCallId: context.provenance.providerToolCallId,
        toolCallIdempotencyKey: context.provenance.idempotencyKey,
        idempotencyScopeId: context.provenance.idempotencyScopeId,
        summary: input.summary,
        operations: {
          baseContentRevision: 4,
          operations: input.operations,
        },
      },
      transaction
    );
  });

  it("rejects invalid or unauditable operation requests before persistence", async () => {
    const createDocumentProposal = vi.fn();
    const tools = createInitialToolRegistry({ createDocumentProposal });

    await expect(
      tools.execute(
        CREATE_DOCUMENT_PROPOSAL_TOOL,
        { ...input, operations: [], trustAgent: true },
        context,
        [CREATE_DOCUMENT_PROPOSAL_TOOL]
      )
    ).rejects.toMatchObject({ code: "TOOL_INPUT_INVALID" });
    await expect(
      tools.execute(
        CREATE_DOCUMENT_PROPOSAL_TOOL,
        input,
        { userId: "user-1", currentPageId: context.currentPageId },
        [CREATE_DOCUMENT_PROPOSAL_TOOL]
      )
    ).rejects.toMatchObject({ code: "TOOL_OWNERSHIP_DENIED" });
    expect(createDocumentProposal).not.toHaveBeenCalled();
  });
});
