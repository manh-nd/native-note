import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryRoundRobinApiKeyPool } from "./api-key-pool";

describe("InMemoryRoundRobinApiKeyPool", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("rotates keys in round-robin order", async () => {
    const pool = new InMemoryRoundRobinApiKeyPool(["key1", "key2", "key3"]);
    await expect(pool.getNextKey()).resolves.toMatchObject({
      keyId: "gemini-key-1",
      apiKey: "key1",
    });
    await expect(pool.getNextKey()).resolves.toMatchObject({
      keyId: "gemini-key-2",
      apiKey: "key2",
    });
    await expect(pool.getNextKey()).resolves.toMatchObject({
      keyId: "gemini-key-3",
      apiKey: "key3",
    });
    await expect(pool.getNextKey()).resolves.toMatchObject({
      keyId: "gemini-key-1",
      apiKey: "key1",
    });
  });

  it("skips keys in cooldown", async () => {
    const pool = new InMemoryRoundRobinApiKeyPool(["key1", "key2"]);
    const first = await pool.getNextKey();
    pool.reportFailure(first.keyId, new Error("rate limited"), {
      cooldownMs: 60_000,
    });
    await expect(pool.getNextKey()).resolves.toMatchObject({
      keyId: "gemini-key-2",
    });
    await expect(pool.getNextKey()).resolves.toMatchObject({
      keyId: "gemini-key-2",
    });
  });

  it("throws when the earliest recovery exceeds maxWaitMs", async () => {
    const pool = new InMemoryRoundRobinApiKeyPool(["key1"]);
    const key = await pool.getNextKey();
    pool.reportFailure(key.keyId, new Error("rate limited"), {
      cooldownMs: 10_000,
    });
    await expect(pool.getNextKey({ maxWaitMs: 5_000 })).rejects.toThrow(
      "All Gemini API keys are currently rate limited"
    );
  });

  it("resets cooldown after a successful request", async () => {
    const pool = new InMemoryRoundRobinApiKeyPool(["key1", "key2"]);
    const key = await pool.getNextKey();
    pool.reportFailure(key.keyId, new Error("temporary"), {
      cooldownMs: 60_000,
    });
    pool.reportSuccess(key.keyId);
    await expect(pool.getNextKey()).resolves.toMatchObject({
      keyId: "gemini-key-2",
    });
    await expect(pool.getNextKey()).resolves.toMatchObject({
      keyId: "gemini-key-1",
    });
  });

  it("rejects an empty key list", () => {
    expect(() => new InMemoryRoundRobinApiKeyPool([])).toThrow(
      "At least one Gemini API key is required"
    );
    expect(() => new InMemoryRoundRobinApiKeyPool(["", "  "])).toThrow(
      "At least one Gemini API key is required"
    );
  });
});
