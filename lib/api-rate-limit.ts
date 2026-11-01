/**
 * A ceiling on how fast one token may call the API.
 *
 * Sign-in already has a limiter; the API had none, so a leaked token could be
 * hammered without anything noticing, and an agent stuck in a loop could bury
 * the database. Writes get a tighter budget than reads because they are the
 * expensive and the irreversible ones.
 *
 * Deliberately in memory: a studio runs one instance of this, and a counter in
 * Postgres would mean a write on every read. The trade-off is stated rather
 * than hidden — behind several instances, or where the limit has to be
 * enforced strictly, put a real limiter in the proxy in front.
 */

const WINDOW_MS = 60_000;
const READ_LIMIT = 120;
const WRITE_LIMIT = 40;

type Bucket = { count: number; writes: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateVerdict =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterSeconds: number; limit: number };

export function checkApiRate(
  tokenId: string,
  { write = false } = {},
  now = Date.now(),
): RateVerdict {
  // Opportunistic sweep: without it the map grows for every token ever seen.
  if (buckets.size > 500) {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }

  let bucket = buckets.get(tokenId);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, writes: 0, resetAt: now + WINDOW_MS };
    buckets.set(tokenId, bucket);
  }

  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((bucket.resetAt - now) / 1000),
  );

  if (write && bucket.writes >= WRITE_LIMIT) {
    return { ok: false, retryAfterSeconds, limit: WRITE_LIMIT };
  }

  if (bucket.count >= READ_LIMIT) {
    return { ok: false, retryAfterSeconds, limit: READ_LIMIT };
  }

  bucket.count += 1;
  if (write) bucket.writes += 1;

  return { ok: true, remaining: READ_LIMIT - bucket.count };
}

/** Tests only: the map is process-wide, so it has to be resettable. */
export function resetApiRateLimits() {
  buckets.clear();
}

export const API_RATE_LIMITS = { WINDOW_MS, READ_LIMIT, WRITE_LIMIT };
