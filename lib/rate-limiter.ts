/**
 * Sliding Window Rate Limiter for AI Art Generation
 * Protects against token abuse while providing a smooth developer and user experience.
 */

interface RateLimitRecord {
  timestamps: number[];
}

const WINDOW_MS = 10 * 60 * 1000; // 10 minutes sliding window
const MAX_REQUESTS = 5; // 5 AI image generations per window

// In-memory store (cleans up stale keys automatically)
const ipStore = new Map<string, RateLimitRecord>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  retryAfterSeconds: number;
  message?: string;
}

export function checkRateLimit(clientId: string): RateLimitResult {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  // Cleanup old records periodically
  if (ipStore.size > 2000) {
    for (const [key, record] of ipStore.entries()) {
      record.timestamps = record.timestamps.filter((ts) => ts > windowStart);
      if (record.timestamps.length === 0) {
        ipStore.delete(key);
      }
    }
  }

  const record = ipStore.get(clientId) || { timestamps: [] };
  // Filter out timestamps outside the active sliding window
  record.timestamps = record.timestamps.filter((ts) => ts > windowStart);

  if (record.timestamps.length >= MAX_REQUESTS) {
    const oldestTimestamp = record.timestamps[0];
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((oldestTimestamp + WINDOW_MS - now) / 1000)
    );
    const minutes = Math.ceil(retryAfterSeconds / 60);

    return {
      allowed: false,
      remaining: 0,
      limit: MAX_REQUESTS,
      retryAfterSeconds,
      message: `You've used all 5 AI card generations for now. Please wait ${minutes} minute${
        minutes > 1 ? "s" : ""
      } to generate more, or choose from our curated designs below!`,
    };
  }

  // Record this generation
  record.timestamps.push(now);
  ipStore.set(clientId, record);

  const remaining = MAX_REQUESTS - record.timestamps.length;

  return {
    allowed: true,
    remaining,
    limit: MAX_REQUESTS,
    retryAfterSeconds: 0,
  };
}
