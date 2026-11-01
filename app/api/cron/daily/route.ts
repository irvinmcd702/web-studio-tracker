import { timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

import { runDailyDigest } from "@/lib/digest";
import { runRetentionSweep } from "@/lib/retention";

/**
 * `POST /api/cron/daily` — the once-a-day run: it throws away what has aged
 * out, then sends the digest.
 *
 * The schedule lives outside the app on purpose. An interval inside the server
 * process looks simpler right up to the moment a second instance starts and
 * everybody gets two letters; a cron calling one endpoint is a thing the
 * operator can see, time, disable and run by hand.
 *
 * POST rather than GET because it sends mail. A URL that mails the whole studio
 * when something prefetches it is not a URL worth having.
 */
export const dynamic = "force-dynamic";

function authorised(request: NextRequest, secret: string) {
  const header = request.headers.get("authorization") ?? "";
  const offered = header.startsWith("Bearer ") ? header.slice(7) : "";

  const a = Buffer.from(offered);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;

  // No secret configured means the endpoint does not exist, rather than an
  // endpoint that exists and lets anyone in.
  if (!secret) {
    return Response.json(
      {
        error: "disabled",
        message: "Set CRON_SECRET to enable the scheduled run",
      },
      { status: 404 },
    );
  }

  if (!authorised(request, secret)) {
    return Response.json({ error: "unauthorised" }, { status: 401 });
  }

  // `{"force": true}` re-runs inside the 12-hour window, for testing a change
  // to the rules without waiting until tomorrow.
  const body = await request.json().catch(() => ({}));
  const force = body?.force === true;

  try {
    // Retention runs first and unconditionally. Throwing away what should not
    // be kept must not depend on somebody having switched the digest on, nor
    // be skipped by the digest's twice-a-day guard.
    const retention = await runRetentionSweep();
    const digest = await runDailyDigest({ force });

    return Response.json(
      { retention, digest },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("[cron/daily]", e);
    return Response.json(
      { error: "failed", message: "The digest run failed; see the server log" },
      { status: 500 },
    );
  }
}
