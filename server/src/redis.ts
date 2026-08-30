// ─────────────────────────────────────────────────────────────────────────────
// Trading Wolf AI — Redis (cache / queue / rate limit / presence)
// Used for: rate limiting, login lockout, AI dedup cache, candle cache,
//           websocket presence, simple job queue for notifications.
// The engine itself keeps its authoritative state in PostgreSQL.
// ─────────────────────────────────────────────────────────────────────────────
import { Redis } from "ioredis";
import { config } from "./config.js";

export const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: 3,
  enableOfflineQueue: true,
  lazyConnect: false,
  retryStrategy: (times: number) => Math.min(times * 250, 5000),
});

redis.on("error", (e: Error) => {
  // Redis is a cache — never crash the process because of it.
  console.error("[redis] error:", e.message);
});

/** True when Redis is reachable (used by /health). */
export async function redisOk(): Promise<boolean> {
  try {
    const pong = await redis.ping();
    return pong === "PONG";
  } catch {
    return false;
  }
}

/** Sliding-window rate limit. Returns true when the call is allowed. */
export async function rateLimit(
  key: string,
  limit: number,
  windowSec = 60
): Promise<boolean> {
  try {
    const k = `rl:${key}`;
    const cur = await redis.incr(k);
    if (cur === 1) await redis.expire(k, windowSec);
    return cur <= limit;
  } catch {
    return true; // fail open: Redis outage must not brick the whole API
  }
}

/** Generic cache get/set with TTL (JSON values). */
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await redis.get(`c:${key}`);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function cacheSet(
  key: string,
  value: unknown,
  ttlSec = 60
): Promise<void> {
  try {
    await redis.set(`c:${key}`, JSON.stringify(value), "EX", ttlSec);
  } catch {
    /* ignore */
  }
}

/** Short-lived lock (atomic job/scan coordination across instances). */
export async function withLock<T>(
  key: string,
  ttlSec: number,
  fn: () => Promise<T>
): Promise<T | null> {
  const ok = await redis.set(`lk:${key}`, "1", "EX", ttlSec, "NX");
  if (!ok) return null; // another worker holds the lock
  try {
    return await fn();
  } finally {
    try {
      await redis.del(`lk:${key}`);
    } catch {
      /* ignore */
    }
  }
}

export async function closeRedis(): Promise<void> {
  try {
    await redis.quit();
  } catch {
    /* ignore */
  }
}
