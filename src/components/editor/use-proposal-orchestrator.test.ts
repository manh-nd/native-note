import { describe, expect, it } from "vitest";
import {
  isProposalStale,
  createProposalDecorationSet,
  type PendingProposal,
} from "./use-proposal-orchestrator";

describe("useProposalOrchestrator logic", () => {
  const proposal: PendingProposal = {
    id: "prop-1",
    scope: "selection",
    baseContentRevision: 2,
    summaryVi: "Đã tối ưu hóa đoạn văn bản chọn.",
    operations: {
      baseContentRevision: 2,
      operations: [
        {
          type: "replace-text",
          target: {
            blockId: "b1",
            expectedText: "Original text",
            from: 0,
            to: 13,
          },
          text: "Improved text",
        },
      ],
    },
  };

  it("detects stale proposal when page contentRevision has moved ahead", () => {
    expect(isProposalStale(proposal, 2)).toBe(false);
    expect(isProposalStale(proposal, 3)).toBe(true);
  });

  it("returns null for stale proposal checks without a proposal", () => {
    expect(isProposalStale(null, 2)).toBe(false);
  });

  it("creates empty decoration set when proposal is null", () => {
    const decoSet = createProposalDecorationSet(null, 2);
    expect(decoSet).toBeNull();
  });
});
