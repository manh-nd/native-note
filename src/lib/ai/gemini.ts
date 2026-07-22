import {
  GoogleGenAI,
  Modality,
  type Content,
  type FunctionDeclaration,
} from "@google/genai";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ApiError } from "../api";
import {
  ALL_KEYS_RATE_LIMITED,
  type ApiKeyLease,
  type ApiKeyPool,
} from "./api-key-pool";
import { getGeminiApiKeyPool } from "./gemini-api-key-pool";

export const TEXT_MODEL = "gemini-3.1-flash-lite";
export const LIVE_MODEL = "gemini-3.1-flash-live-preview";

const REQUEST_TIMEOUT_MS = 45_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_MAX_WAIT_MS = 5_000;

export type GeminiRequestOptions = {
  keyPool?: ApiKeyPool;
  maxAttempts?: number;
  maxWaitMs?: number;
  signal?: AbortSignal;
};

const GEMINI_SCHEMA_KEYS = new Set([
  "$id",
  "$defs",
  "$ref",
  "$anchor",
  "type",
  "format",
  "title",
  "description",
  "enum",
  "items",
  "prefixItems",
  "minimum",
  "maximum",
  "anyOf",
  "oneOf",
  "properties",
  "additionalProperties",
  "required",
  "propertyOrdering",
]);

type JsonSchemaObject = Record<string, unknown>;

function isJsonSchemaObject(value: unknown): value is JsonSchemaObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Gemini structured output accepts only a subset of JSON Schema. Zod emits
 * validation-only keywords such as $schema, minLength, maxLength and default,
 * plus large array bounds on nested objects, can make a request fail with
 * INVALID_ARGUMENT. Zod still enforces those bounds after the response.
 */
export function toGeminiJsonSchema(schema: z.ZodType<unknown>) {
  return sanitizeJsonSchema(z.toJSONSchema(schema));
}

function sanitizeJsonSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeJsonSchema);
  if (!isJsonSchemaObject(value)) return value;

  const result: JsonSchemaObject = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "properties" || key === "$defs") {
      if (isJsonSchemaObject(child)) {
        result[key] = Object.fromEntries(
          Object.entries(child).map(([name, schema]) => [
            name,
            sanitizeJsonSchema(schema),
          ])
        );
      }
      continue;
    }
    if (GEMINI_SCHEMA_KEYS.has(key)) result[key] = sanitizeJsonSchema(child);
  }
  return result;
}

export function getTextModel() {
  return process.env.GEMINI_DEFAULT_MODEL?.trim() || TEXT_MODEL;
}

class GoogleGenAiCache {
  private readonly clients = new Map<string, GoogleGenAI>();

  get(apiKey: string, apiVersion?: string) {
    const cacheKey = `${apiVersion ?? "default"}:${apiKey}`;
    let instance = this.clients.get(cacheKey);
    if (!instance) {
      instance = new GoogleGenAI({
        apiKey,
        ...(apiVersion ? { httpOptions: { apiVersion } } : {}),
      });
      this.clients.set(cacheKey, instance);
    }
    return instance;
  }
}

const clientCache = new GoogleGenAiCache();

export function redactGeminiError(error: unknown, lease: ApiKeyLease): Error {
  const message = error instanceof Error ? error.message : String(error);
  const redactedMessage = message.replaceAll(
    lease.apiKey,
    `[REDACTED:${lease.keyId}]`
  );
  const redacted = new Error(redactedMessage);
  redacted.name = error instanceof Error ? error.name : "Error";

  if (error instanceof Error && error.stack) {
    redacted.stack = error.stack.replaceAll(
      lease.apiKey,
      `[REDACTED:${lease.keyId}]`
    );
  }
  if (typeof error === "object" && error !== null) {
    for (const key of Object.keys(error)) {
      if (key !== "message" && key !== "stack") {
        (redacted as unknown as Record<string, unknown>)[key] = (
          error as Record<string, unknown>
        )[key];
      }
    }
  }
  return redacted;
}

function getStatus(error: unknown) {
  if (typeof error !== "object" || error === null) return undefined;
  const value = error as {
    status?: unknown;
    statusCode?: unknown;
    response?: { status?: unknown };
  };
  const status = value.status ?? value.statusCode ?? value.response?.status;
  if (typeof status === "number") return status;
  if (typeof status === "string" && /^\d{3}$/.test(status))
    return Number(status);
  return undefined;
}

function isRetryable(error: unknown) {
  const status = getStatus(error);
  return status === 429 || status === 500 || status === 503 || status === 504;
}

function cooldownFor(error: unknown) {
  return getStatus(error) === 429 ? 60_000 : undefined;
}

function isAllKeysLimited(error: unknown) {
  return (
    error instanceof Error && error.message.includes(ALL_KEYS_RATE_LIMITED)
  );
}

function mapGeminiError(
  error: unknown,
  context: "text" | "live",
  timedOut = false
): ApiError {
  if (error instanceof ApiError) return error;
  if (isAllKeysLimited(error)) {
    return new ApiError(
      503,
      "AI đang bận hoặc các API key đã chạm giới hạn. Hãy thử lại sau một chút.",
      "AI_RATE_LIMITED"
    );
  }
  if (getStatus(error) === 429) {
    return new ApiError(
      503,
      "AI đang bận hoặc các API key đã chạm giới hạn. Hãy thử lại sau một chút.",
      "AI_RATE_LIMITED"
    );
  }
  if (getStatus(error) === 401 || getStatus(error) === 403) {
    return new ApiError(
      503,
      "Gemini API key không hợp lệ hoặc chưa được cấp quyền. Hãy kiểm tra GEMINI_API_KEYS.",
      "AI_AUTH_FAILED"
    );
  }
  if (getStatus(error) === 404) {
    return new ApiError(
      502,
      "Model Gemini hiện không khả dụng. Hãy kiểm tra GEMINI_DEFAULT_MODEL.",
      "AI_MODEL_NOT_FOUND"
    );
  }
  if (timedOut)
    return new ApiError(504, "AI phản hồi quá lâu. Hãy thử lại.", "AI_TIMEOUT");
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return new ApiError(
      502,
      "AI trả về dữ liệu không đúng định dạng.",
      "INVALID_AI_RESPONSE"
    );
  }
  if (context === "live")
    return new ApiError(
      502,
      "Không thể tạo phiên luyện nói. Hãy thử lại.",
      "LIVE_TOKEN_FAILED"
    );
  return new ApiError(
    502,
    "Không thể nhận phản hồi hợp lệ từ AI. Hãy thử lại.",
    "AI_PROVIDER_ERROR"
  );
}

function logProviderFailure(
  context: "text" | "live",
  lease: ApiKeyLease,
  error: Error,
  attempt: number
) {
  console.error("[Gemini] provider request failed", {
    context,
    attempt,
    keyId: lease.keyId,
    status: getStatus(error),
    name: error.name,
    message: error.message,
  });
}

function createAttemptSignal(signal?: AbortSignal) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const forwardAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", forwardAbort, { once: true });
  }
  return {
    signal: controller.signal,
    timedOut: () => controller.signal.aborted && !signal?.aborted,
    cleanup: () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", forwardAbort);
    },
  };
}

function getPool(options?: GeminiRequestOptions) {
  try {
    return options?.keyPool ?? getGeminiApiKeyPool();
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("Missing GEMINI_API_KEYS") ||
        error.message.includes("At least one Gemini API key"))
    ) {
      throw new ApiError(
        503,
        "Gemini chưa được cấu hình. Hãy thêm GEMINI_API_KEYS.",
        "AI_NOT_CONFIGURED"
      );
    }
    throw error;
  }
}

export async function generateStructured<T>(
  schema: z.ZodType<T>,
  prompt: string,
  systemInstruction: string,
  options?: GeminiRequestOptions
) {
  const pool = getPool(options);
  const maxAttempts = options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const maxWaitMs = options?.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let lease: ApiKeyLease;
    try {
      lease = await pool.getNextKey({ maxWaitMs });
    } catch (error) {
      throw mapGeminiError(error, "text");
    }

    const attemptSignal = createAttemptSignal(options?.signal);
    try {
      const response = await clientCache
        .get(lease.apiKey)
        .models.generateContent({
          model: getTextModel(),
          contents: prompt,
          config: {
            systemInstruction,
            responseMimeType: "application/json",
            responseJsonSchema: toGeminiJsonSchema(schema),
            abortSignal: attemptSignal.signal,
          },
        });
      if (!response.text)
        throw new ApiError(
          502,
          "AI không trả về nội dung.",
          "EMPTY_AI_RESPONSE"
        );

      const parsed = schema.parse(JSON.parse(response.text));
      pool.reportSuccess(lease.keyId);
      return parsed;
    } catch (error) {
      if (
        error instanceof ApiError ||
        error instanceof z.ZodError ||
        error instanceof SyntaxError
      ) {
        throw mapGeminiError(error, "text", attemptSignal.timedOut());
      }
      const redacted = redactGeminiError(error, lease);
      lastError = redacted;
      if (!isRetryable(redacted) || options?.signal?.aborted) {
        logProviderFailure("text", lease, redacted, attempt);
        throw mapGeminiError(redacted, "text", attemptSignal.timedOut());
      }
      logProviderFailure("text", lease, redacted, attempt);
      pool.reportFailure(lease.keyId, redacted, {
        cooldownMs: cooldownFor(redacted),
      });
    } finally {
      attemptSignal.cleanup();
    }
  }

  throw mapGeminiError(lastError, "text");
}

export async function generateAgentStep(
  contents: Content[],
  systemInstruction: string,
  functionDeclarations: FunctionDeclaration[],
  options?: GeminiRequestOptions & { model?: string }
) {
  const pool = getPool(options);
  const maxAttempts = options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const maxWaitMs = options?.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let lease: ApiKeyLease;
    try {
      lease = await pool.getNextKey({ maxWaitMs });
    } catch (error) {
      throw mapGeminiError(error, "text");
    }
    const attemptSignal = createAttemptSignal(options?.signal);
    try {
      const response = await clientCache
        .get(lease.apiKey)
        .models.generateContent({
          model: options?.model ?? getTextModel(),
          contents,
          config: {
            systemInstruction,
            ...(functionDeclarations.length
              ? { tools: [{ functionDeclarations }] }
              : {}),
            abortSignal: attemptSignal.signal,
          },
        });
      const calls = (response.functionCalls ?? []).map((call, index) => ({
        id: call.id ?? `call-${randomUUID()}-${index}`,
        name: call.name ?? "",
        input: call.args ?? {},
      }));
      const text = response.text?.trim() || null;
      if (!text && calls.length === 0)
        throw new ApiError(
          502,
          "AI không trả về nội dung hoặc Tool call.",
          "EMPTY_AI_RESPONSE"
        );
      pool.reportSuccess(lease.keyId);
      return { text, calls };
    } catch (error) {
      if (error instanceof ApiError || options?.signal?.aborted)
        throw mapGeminiError(error, "text", attemptSignal.timedOut());
      const redacted = redactGeminiError(error, lease);
      lastError = redacted;
      if (!isRetryable(redacted)) {
        logProviderFailure("text", lease, redacted, attempt);
        throw mapGeminiError(redacted, "text", attemptSignal.timedOut());
      }
      logProviderFailure("text", lease, redacted, attempt);
      pool.reportFailure(lease.keyId, redacted, {
        cooldownMs: cooldownFor(redacted),
      });
    } finally {
      attemptSignal.cleanup();
    }
  }
  throw mapGeminiError(lastError, "text");
}

export async function createLiveToken(
  systemInstruction: string,
  options?: GeminiRequestOptions
) {
  const pool = getPool(options);
  const maxAttempts = options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const maxWaitMs = options?.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let lease: ApiKeyLease;
    try {
      lease = await pool.getNextKey({ maxWaitMs });
    } catch (error) {
      throw mapGeminiError(error, "live");
    }

    const attemptSignal = createAttemptSignal(options?.signal);
    try {
      const now = Date.now();
      const token = await clientCache
        .get(lease.apiKey, "v1alpha")
        .authTokens.create({
          config: {
            uses: 1,
            abortSignal: attemptSignal.signal,
            newSessionExpireTime: new Date(now + 60_000).toISOString(),
            expireTime: new Date(now + 11 * 60_000).toISOString(),
            liveConnectConstraints: {
              model: LIVE_MODEL,
              config: {
                responseModalities: [Modality.AUDIO],
                inputAudioTranscription: {},
                outputAudioTranscription: {},
                systemInstruction,
              },
            },
            lockAdditionalFields: [],
          },
        });
      if (!token.name)
        throw new ApiError(
          502,
          "Không thể tạo phiên luyện nói.",
          "LIVE_TOKEN_FAILED"
        );
      pool.reportSuccess(lease.keyId);
      return token.name;
    } catch (error) {
      if (error instanceof ApiError || options?.signal?.aborted) {
        throw mapGeminiError(error, "live", attemptSignal.timedOut());
      }
      const redacted = redactGeminiError(error, lease);
      lastError = redacted;
      if (!isRetryable(redacted)) {
        logProviderFailure("live", lease, redacted, attempt);
        throw mapGeminiError(redacted, "live", attemptSignal.timedOut());
      }
      logProviderFailure("live", lease, redacted, attempt);
      pool.reportFailure(lease.keyId, redacted, {
        cooldownMs: cooldownFor(redacted),
      });
    } finally {
      attemptSignal.cleanup();
    }
  }

  throw mapGeminiError(lastError, "live");
}
