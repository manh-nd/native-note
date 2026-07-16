import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createToolRegistry, redactToolAuditValue } from "../index";

const context = { userId: "user-1", currentPageId: "page-1" };

function registry(overrides: Record<string, unknown> = {}) {
  return createToolRegistry([
    {
      name: "read_current_page",
      description: "Read the current Page snapshot.",
      inputSchema: z.object({}).strict(),
      outputSchema: z.object({ pageId: z.string(), text: z.string() }),
      ownership: "current_user",
      risk: "low",
      approval: "not_required",
      authorize: vi.fn(async () => true),
      execute: vi.fn(async () => ({ pageId: "page-1", text: "Draft" })),
      ...overrides,
    },
  ]);
}

describe("Tool registry", () => {
  it("validates authorization and schemas before returning a Tool result", async () => {
    const tools = registry();

    await expect(
      tools.execute("read_current_page", {}, context, ["read_current_page"])
    ).resolves.toMatchObject({
      output: { pageId: "page-1", text: "Draft" },
      snapshot: {
        name: "read_current_page",
        ownership: "current_user",
        risk: "low",
        approval: "not_required",
      },
    });
  });

  it.each([
    ["TOOL_NOT_ALLOWED", registry(), "unknown", {}],
    ["TOOL_INPUT_INVALID", registry(), "read_current_page", { extra: true }],
    [
      "TOOL_OWNERSHIP_DENIED",
      registry({ authorize: vi.fn(async () => false) }),
      "read_current_page",
      {},
    ],
    [
      "TOOL_OUTPUT_INVALID",
      registry({ execute: vi.fn(async () => ({ pageId: "page-1" })) }),
      "read_current_page",
      {},
    ],
  ])(
    "fails with %s before unsafe data can escape",
    async (code, tools, name, input) => {
      await expect(
        tools.execute(name as string, input, context, ["read_current_page"])
      ).rejects.toMatchObject({ code });
    }
  );

  it("redacts nested secrets before audit persistence", () => {
    expect(
      redactToolAuditValue({
        query: "grammar",
        apiKey: "secret-key",
        nested: { authorization: "Bearer secret", value: "safe" },
        text: "Use apiKey=abc123 and Bearer xyz987 in this Page.",
      })
    ).toEqual({
      query: "grammar",
      apiKey: "[REDACTED]",
      nested: { authorization: "[REDACTED]", value: "safe" },
      text: "Use [REDACTED] and [REDACTED] in this Page.",
    });
  });

  it("rejects malformed Tool definitions at registration", () => {
    expect(() =>
      createToolRegistry([
        {
          name: "unsafe_tool",
          description: "Unsafe metadata.",
          inputSchema: z.object({}),
          outputSchema: z.object({}),
          ownership: "workspace_member",
          risk: "unknown",
          approval: "sometimes",
          authorize: async () => true,
          execute: async () => ({}),
        } as never,
      ])
    ).toThrow(/invalid ownership/i);
  });
});
