// Per-visitor demo rate limiting. In-memory is acceptable at this stage: it
// resets on cold starts, but the durable backstop is demos.message_count,
// which caps total spend per demo regardless of instance recycling.

const WINDOW_MS = 24 * 60 * 60 * 1000;

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export const DEMO_VISITOR_LIMIT = 15; // messages per visitor per day (per spec)
export const DEMO_TOTAL_LIMIT = 300; // lifetime cap per demo
export const CLIENT_VISITOR_LIMIT = 60; // generous cap for paying clients' visitors

export function checkRateLimit(key: string, limit: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}
