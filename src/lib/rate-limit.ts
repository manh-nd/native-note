import { ApiError } from "./api";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, limit = 20, windowMs = 60_000) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (bucket.count >= limit) throw new ApiError(429, "Bạn đang gửi yêu cầu quá nhanh. Hãy thử lại sau một phút.", "RATE_LIMITED");
  bucket.count += 1;
}
