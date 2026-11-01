/**
 * Working out who is knocking, when something else is standing in front.
 *
 * The obvious header is the wrong one. Cloudflare **appends** the real address
 * to whatever `X-Forwarded-For` the client sent, so the first entry of that
 * header is a value the caller chose — read it and a single attacker can look
 * like a fresh address on every request, which is exactly what the sign-in
 * limiter is there to stop.
 *
 * `CF-Connecting-IP` is set by Cloudflare and overwritten on every request, so
 * it cannot be forged from outside. That is the one to trust when it is there.
 *
 * Order, and why:
 *
 * 1. `CF-Connecting-IP` — set by Cloudflare, not forgeable.
 * 2. `X-Real-IP` — what nginx and Caddy set from the socket they accepted.
 * 3. `X-Forwarded-For`, first entry — correct only when your own proxy
 *    *replaces* the header rather than appending to it. Last resort.
 *
 * With nothing in front at all, none of these exist and the result is
 * "unknown", which the limiter deliberately does not count: one shared bucket
 * for everybody behind an unknown address is worse than no bucket at all.
 */
export function clientIpFrom(headers: Headers): string {
  const cloudflare = headers.get("cf-connecting-ip")?.trim();
  if (cloudflare) return cloudflare;

  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;

  const forwarded = headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return first;

  return "unknown";
}
