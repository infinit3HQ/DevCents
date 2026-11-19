/**
 * Small in-memory fixed-window rate limiter. DevCents runs as a single web
 * container, so per-process state is enough; Convex-side caps back it up.
 */

export type RateLimitRule = { limit: number; windowMs: number };

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

type Bucket = { count: number; resetAt: number };

const MAX_BUCKETS = 50_000;

export function createRateLimiter(now: () => number = Date.now) {
  const buckets = new Map<string, Bucket>();

  function sweep(time: number) {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= time) buckets.delete(key);
    }
  }

  return function check(key: string, rule: RateLimitRule): RateLimitResult {
    const time = now();
    if (buckets.size > MAX_BUCKETS) sweep(time);

    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= time) {
      buckets.set(key, { count: 1, resetAt: time + rule.windowMs });
      return { ok: true };
    }
    if (bucket.count >= rule.limit) {
      return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - time) / 1000)) };
    }
    buckets.set(key, { count: bucket.count + 1, resetAt: bucket.resetAt });
    return { ok: true };
  };
}

export const RATE_LIMITS = {
  register: { limit: 10, windowMs: 60 * 60 * 1000 },
  token: { limit: 30, windowMs: 60 * 1000 },
  mcp: { limit: 120, windowMs: 60 * 1000 },
} satisfies Record<string, RateLimitRule>;

export type RateLimitName = keyof typeof RATE_LIMITS;

const limiter = createRateLimiter();

export function checkRateLimit(name: RateLimitName, ip: string): RateLimitResult {
  return limiter(`${name}:${ip}`, RATE_LIMITS[name]);
}
