import { timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

import { runOutreachTick } from "@/lib/outreach-send";

/**
 * `POST /api/cron/outreach` — the frequent run that actually sends.
 *
 * A second cadence rather than a second secret: same operator, same trust
 * boundary, and DEPLOY.md already tells people to set `CRON_SECRET`. Every
 * five minutes, from the same sidecar that runs the daily digest.
 *
 * **Five minutes is the resolution of everything downstream.** A campaign
 * asking for a two-minute gap between messages gets five, and a send window
 * closes up to five minutes late. The campaign page says so in words rather
 * than letting somebody discover it from the timestamps.
 *
 * POST, and 404 without a secret, for the same reasons as the daily route: a
 * URL that sends mail when something prefetches it is not a URL worth having,
 * and an endpoint nobody has enabled should not admit to being there.
 *
 * When outreach is off — which is the default — this costs one settings read
 * every five minutes and returns `{skipped}`.
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

  try {
    const report = await runOutreachTick();
    return Response.json(report, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[cron/outreach]", e);
    return Response.json(
      { error: "failed", message: "The outreach run failed; see the server log" },
      { status: 500 },
    );
  }
}
