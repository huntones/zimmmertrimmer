// In-memory fixed-window rate limiter.
//
// Keys are composed by the caller from action + IP + public_id +
// recipient + session, so a given abuse vector can be throttled on any
// combination. In-memory is fine for a single instance and for tests;
// for a multi-instance deployment back this with the existing Cloudflare
// UsageLimiter Durable Object or Redis (same interface).
const buckets = new Map(); // key -> { count, resetAt }

function now() { return Date.now(); }

// Returns { allowed, remaining, retryAfter } (retryAfter in seconds).
export function rateLimit(key, { limit, windowSec }) {
  const t = now();
  let b = buckets.get(key);
  if (!b || b.resetAt <= t) {
    b = { count: 0, resetAt: t + windowSec * 1000 };
    buckets.set(key, b);
  }
  b.count += 1;
  const allowed = b.count <= limit;
  return {
    allowed,
    remaining: Math.max(0, limit - b.count),
    retryAfter: allowed ? 0 : Math.ceil((b.resetAt - t) / 1000),
  };
}

// Sweep expired buckets occasionally so the Map doesn't grow unbounded.
let sweepTimer = null;
export function startRateLimitSweeper() {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    const t = now();
    for (const [k, b] of buckets) if (b.resetAt <= t) buckets.delete(k);
  }, 60_000);
  sweepTimer.unref?.();
}

export function resetRateLimits() { buckets.clear(); }   // test helper

// Named policies for the endpoints the spec calls out.
export const POLICY = {
  password_attempt:  { limit: 8,  windowSec: 300 },   // 8 / 5min
  send_code:         { limit: 5,  windowSec: 600 },   // 5 / 10min
  verify_code:       { limit: 10, windowSec: 600 },   // 10 / 10min
  public_open:       { limit: 60, windowSec: 60 },    // 60 / min
  presign:           { limit: 60, windowSec: 60 },    // 60 / min
  download_all:      { limit: 10, windowSec: 300 },   // 10 / 5min
};
