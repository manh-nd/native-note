import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  createLiveToken,
  generateAgentStep,
  generateStructured,
  redactGeminiError,
  toGeminiJsonSchema,
} from "./gemini";
import type { ApiKeyPool } from "./api-key-pool";

const mockGenerateContent = vi.fn();
const mockCreateToken = vi.fn();

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: mockGenerateContent };
    authTokens = { create: mockCreateToken };
  },
  Modality: { AUDIO: "AUDIO" },
}));

vi.mock("../api", () => ({
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

describe("Gemini AI client", () => {
  beforeEach(() => {
    mockGenerateContent.mockReset();
    mockCreateToken.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function poolFor(
    ...leases: Array<{ keyId: string; apiKey: string }>
  ): ApiKeyPool {
    let index = 0;
    return {
      getNextKey: vi.fn(
        async () => leases[Math.min(index++, leases.length - 1)]
      ),
      reportSuccess: vi.fn(),
      reportFailure: vi.fn(),
    };
  }

  it("returns validated structured JSON and reports success", async () => {
    mockGenerateContent.mockResolvedValue({ text: '{"value":"ok"}' });
    const pool = poolFor({ keyId: "gemini-key-1", apiKey: "key-one" });

    await expect(
      generateStructured(z.object({ value: z.string() }), "input", "system", {
        keyPool: pool,
      })
    ).resolves.toEqual({ value: "ok" });
    expect(pool.reportSuccess).toHaveBeenCalledWith("gemini-key-1");
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it("assigns unique invocation ids when Gemini omits function-call ids", async () => {
    mockGenerateContent.mockResolvedValue({
      text: null,
      functionCalls: [{ name: "read_current_page", args: {} }],
    });
    const pool = poolFor({ keyId: "gemini-key-1", apiKey: "key-one" });

    const first = await generateAgentStep([], "system", [], { keyPool: pool });
    const second = await generateAgentStep([], "system", [], { keyPool: pool });

    expect(first.calls[0]?.id).toBeTruthy();
    expect(second.calls[0]?.id).toBeTruthy();
    expect(second.calls[0]?.id).not.toBe(first.calls[0]?.id);
  });

  it("strips Zod-only JSON Schema keywords before sending to Gemini", () => {
    const schema = toGeminiJsonSchema(
      z.object({
        value: z.string().min(1).max(20),
        optional: z.string().default(""),
        items: z
          .array(z.object({ label: z.string() }))
          .min(1)
          .max(30),
      })
    );
    expect(schema).toEqual({
      type: "object",
      properties: {
        value: { type: "string" },
        optional: { type: "string" },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: { label: { type: "string" } },
            required: ["label"],
            additionalProperties: false,
          },
        },
      },
      required: ["value", "optional", "items"],
      additionalProperties: false,
    });
  });

  it("retries a transient error with the next key", async () => {
    mockGenerateContent
      .mockRejectedValueOnce(
        Object.assign(new Error("quota exceeded"), { status: 429 })
      )
      .mockResolvedValueOnce({ text: '{"value":"ok"}' });
    const pool = poolFor(
      { keyId: "gemini-key-1", apiKey: "key-one" },
      { keyId: "gemini-key-2", apiKey: "key-two" }
    );

    await expect(
      generateStructured(z.object({ value: z.string() }), "input", "system", {
        keyPool: pool,
      })
    ).resolves.toEqual({ value: "ok" });
    expect(pool.reportFailure).toHaveBeenCalledWith(
      "gemini-key-1",
      expect.any(Error),
      { cooldownMs: 60_000 }
    );
    expect(pool.reportSuccess).toHaveBeenCalledWith("gemini-key-2");
  });

  it("does not retry a non-transient provider error", async () => {
    mockGenerateContent.mockRejectedValue(
      Object.assign(new Error("bad request"), { status: 400 })
    );
    const pool = poolFor({ keyId: "gemini-key-1", apiKey: "key-one" });
    await expect(
      generateStructured(z.object({ value: z.string() }), "input", "system", {
        keyPool: pool,
      })
    ).rejects.toMatchObject({
      code: "AI_PROVIDER_ERROR",
    });
    expect(pool.getNextKey).toHaveBeenCalledTimes(1);
    expect(pool.reportFailure).not.toHaveBeenCalled();
  });

  it("stops after the configured number of transient attempts", async () => {
    mockGenerateContent.mockRejectedValue(
      Object.assign(new Error("server error"), { status: 500 })
    );
    const pool = poolFor({ keyId: "gemini-key-1", apiKey: "key-one" });
    await expect(
      generateStructured(z.object({ value: z.string() }), "input", "system", {
        keyPool: pool,
        maxAttempts: 3,
      })
    ).rejects.toMatchObject({
      code: "AI_PROVIDER_ERROR",
    });
    expect(mockGenerateContent).toHaveBeenCalledTimes(3);
    expect(pool.reportFailure).toHaveBeenCalledTimes(3);
  });

  it("returns a friendly rate-limit error after repeated 429 responses", async () => {
    mockGenerateContent.mockRejectedValue(
      Object.assign(new Error("quota exceeded"), { status: 429 })
    );
    const pool = poolFor(
      { keyId: "gemini-key-1", apiKey: "key-one" },
      { keyId: "gemini-key-2", apiKey: "key-two" },
      { keyId: "gemini-key-3", apiKey: "key-three" }
    );

    await expect(
      generateStructured(z.object({ value: z.string() }), "input", "system", {
        keyPool: pool,
      })
    ).rejects.toMatchObject({
      code: "AI_RATE_LIMITED",
      status: 503,
    });
  });

  it("redacts the raw key from message and stack", () => {
    const lease = { keyId: "gemini-key-1", apiKey: "key-one" };
    const error = new Error("API key key-one is invalid");
    const redacted = redactGeminiError(error, lease);
    expect(redacted.message).toBe("API key [REDACTED:gemini-key-1] is invalid");
    expect(redacted.stack).toContain("[REDACTED:gemini-key-1]");
    expect(redacted.stack).not.toContain("key-one");
  });

  it("rotates keys for Live token creation", async () => {
    mockCreateToken
      .mockRejectedValueOnce(
        Object.assign(new Error("rate limited"), { status: 429 })
      )
      .mockResolvedValueOnce({ name: "live-token" });
    const pool = poolFor(
      { keyId: "gemini-key-1", apiKey: "key-one" },
      { keyId: "gemini-key-2", apiKey: "key-two" }
    );

    await expect(createLiveToken("system", { keyPool: pool })).resolves.toBe(
      "live-token"
    );
    expect(mockCreateToken).toHaveBeenCalledTimes(2);
    expect(pool.reportFailure).toHaveBeenCalledWith(
      "gemini-key-1",
      expect.any(Error),
      { cooldownMs: 60_000 }
    );
    expect(pool.reportSuccess).toHaveBeenCalledWith("gemini-key-2");
  });

  it("maps missing configuration to a safe API error", async () => {
    const previous = process.env.GEMINI_API_KEYS;
    delete process.env.GEMINI_API_KEYS;
    try {
      await expect(
        generateStructured(z.object({ value: z.string() }), "input", "system")
      ).rejects.toEqual(expect.objectContaining({ code: "AI_NOT_CONFIGURED" }));
    } finally {
      if (previous === undefined) delete process.env.GEMINI_API_KEYS;
      else process.env.GEMINI_API_KEYS = previous;
    }
  });
});
