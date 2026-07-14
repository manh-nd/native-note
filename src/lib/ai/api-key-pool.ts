export type ApiKeyLease = {
  keyId: string;
  apiKey: string;
};

export type GetNextKeyOptions = {
  maxWaitMs?: number;
};

export type ReportFailureOptions = {
  cooldownMs?: number;
};

export type ApiKeyPool = {
  getNextKey(options?: GetNextKeyOptions): Promise<ApiKeyLease>;
  reportSuccess(keyId: string): void;
  reportFailure(
    keyId: string,
    error: unknown,
    options?: ReportFailureOptions
  ): void;
};

export const ALL_KEYS_RATE_LIMITED =
  "All Gemini API keys are currently rate limited";

type ApiKeyState = {
  keyId: string;
  apiKey: string;
  cooldownUntil: number;
  consecutiveFailures: number;
};

/**
 * Process-local best-effort pool. Use keys from separate projects when more
 * quota is needed because Gemini quota is generally project-scoped.
 */
export class InMemoryRoundRobinApiKeyPool implements ApiKeyPool {
  private readonly keys: ApiKeyState[];
  private cursor = 0;

  constructor(apiKeys: string[]) {
    const normalized = apiKeys.map((key) => key.trim()).filter(Boolean);
    if (!normalized.length)
      throw new Error("At least one Gemini API key is required");

    this.keys = normalized.map((apiKey, index) => ({
      keyId: `gemini-key-${index + 1}`,
      apiKey,
      cooldownUntil: 0,
      consecutiveFailures: 0,
    }));
  }

  async getNextKey(options?: GetNextKeyOptions): Promise<ApiKeyLease> {
    const now = Date.now();
    for (let offset = 0; offset < this.keys.length; offset += 1) {
      const index = (this.cursor + offset) % this.keys.length;
      const candidate = this.keys[index];
      if (candidate.cooldownUntil <= now) {
        this.cursor = (index + 1) % this.keys.length;
        return { keyId: candidate.keyId, apiKey: candidate.apiKey };
      }
    }

    const earliest = this.keys.reduce((current, candidate) =>
      current.cooldownUntil <= candidate.cooldownUntil ? current : candidate
    );
    const waitMs = Math.max(earliest.cooldownUntil - now, 0);
    if (options?.maxWaitMs !== undefined && waitMs > options.maxWaitMs) {
      throw new Error(ALL_KEYS_RATE_LIMITED);
    }
    if (waitMs > 0) await sleep(waitMs);

    this.cursor =
      (this.keys.findIndex((item) => item.keyId === earliest.keyId) + 1) %
      this.keys.length;
    return { keyId: earliest.keyId, apiKey: earliest.apiKey };
  }

  reportSuccess(keyId: string): void {
    const key = this.keys.find((item) => item.keyId === keyId);
    if (!key) return;
    key.consecutiveFailures = 0;
    key.cooldownUntil = 0;
  }

  reportFailure(
    keyId: string,
    _error: unknown,
    options?: ReportFailureOptions
  ): void {
    const key = this.keys.find((item) => item.keyId === keyId);
    if (!key) return;

    key.consecutiveFailures += 1;
    const baseCooldownMs =
      options?.cooldownMs ??
      Math.min(60_000 * key.consecutiveFailures, 5 * 60_000);
    const jitter = Math.floor(Math.random() * 5_000);
    key.cooldownUntil = Date.now() + baseCooldownMs + jitter;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
