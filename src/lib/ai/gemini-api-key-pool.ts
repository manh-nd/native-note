import { InMemoryRoundRobinApiKeyPool } from "./api-key-pool";

let singletonPool: InMemoryRoundRobinApiKeyPool | undefined;

export function getGeminiApiKeyPool() {
  if (singletonPool) return singletonPool;

  const rawKeys = process.env.GEMINI_API_KEYS;
  if (!rawKeys) throw new Error("Missing GEMINI_API_KEYS");

  const keys = rawKeys
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);
  if (!keys.length) throw new Error("At least one Gemini API key is required");

  singletonPool = new InMemoryRoundRobinApiKeyPool(keys);
  return singletonPool;
}
