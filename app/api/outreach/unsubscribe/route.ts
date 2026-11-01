import { prisma } from "@/lib/db";
import { clientIpFrom } from "@/lib/client-ip";
import { allowPublic } from "@/lib/public-rate-limit";
import { emailKey, looksLikeEmail, suppress } from "@/lib/leads";
import { readUnsubscribeToken } from "@/lib/outreach-tokens";
import { recordTimeline } from "@/lib/timeline";

/**
 * `POST /api/outreach/unsubscribe` — taking an address off the list.
 *
 * **A route handler and not a server action, deliberately.** RFC 8058
 * one-click unsubscribe is a mail client posting on the reader's behalf, with
 * no browser, no session and no Next action id in the request. A server action
 * cannot be reached that way, so this is the only shape that works. There is
 * no `middleware.ts` in this repository, so nothing stands in front of it.
 *
 * It answers three callers with one code path:
 *
 * - a mail client posting `List-Unsubscribe=One-Click` with `?t=<token>`
 * - the confirmation button on `/unsubscribe/<token>`
 * - the by-address form, for somebody whose link no longer verifies
 *
 * **Idempotent.** A second post finds the row already there and still answers
 * 200. A mail client that retries, or a person who presses the link again next
 * month, must not see an error for succeeding twice.
 *
 * **GET is not implemented on purpose.** Corporate mail gateways prefetch
 * every URL in a message; a GET that unsubscribed would take people off the
 * list who never touched the link.
 */
export const dynamic = "force-dynamic";

const DONE = "You have been unsubscribed. Nothing further will be sent.";

function wantsHtml(request: Request) {
  const type = request.headers.get("content-type") ?? "";
  return (
    type.includes("application/x-www-form-urlencoded") ||
    type.includes("multipart/form-data")
  );
}

function answer(request: Request, ok: boolean, message: string) {
  if (wantsHtml(request)) {
    // A relative Location, resolved by the browser against the request it
    // just made. `Response.redirect` needs an absolute URL, which means
    // guessing this server's public origin from `request.url` — and behind a
    // proxy, or bound to a loopback address, that guess is wrong and the
    // recipient lands on a browser error page having already been
    // unsubscribed. A relative header cannot be wrong.
    //
    // 303 so the browser follows with GET and a refresh cannot post again.
    return new Response(null, {
      status: 303,
      headers: {
        Location: ok ? "/unsubscribe/done" : "/unsubscribe?problem=1",
      },
    });
  }
  return new Response(message, {
    status: ok ? 200 : 400,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function POST(request: Request) {
  const ip = clientIpFrom(request.headers);
  const allowed = await allowPublic("unsubscribe", ip);
  if (!allowed.ok) {
    return new Response("Too many requests", {
      status: 429,
      headers: {
        "Retry-After": String(Math.ceil(allowed.retryAfterMs / 1000)),
      },
    });
  }

  // The token may arrive in the query (one-click, and the link in the footer)
  // or in the form body (the confirmation button posts it as a field).
  const url = new URL(request.url);
  let token = url.searchParams.get("t");
  let email: string | null = null;

  if (wantsHtml(request)) {
    const form = await request.formData();
    token = token ?? (String(form.get("token") ?? "").trim() || null);
    email = String(form.get("email") ?? "").trim() || null;
  }

  if (token) {
    const leadId = readUnsubscribeToken(token);
    if (leadId) {
      const lead = await prisma.lead.findUnique({ where: { id: leadId } });
      // A verified token for a lead that has since been deleted is not an
      // error: there is nothing left to mail, which is what was asked for.
      if (lead) {
        await suppress({
          email: lead.email,
          reason: "UNSUBSCRIBE",
          source: "one-click unsubscribe",
        });
        await recordTimeline({
          kind: "UNSUBSCRIBE",
          summary: "Unsubscribed using the link in a message",
          actorKind: "CONTACT",
          leadId: lead.id,
        });
      }
      return answer(request, true, DONE);
    }
    // Falls through: a token that does not verify is not the end of the road,
    // because rotating AUTH_SECRET invalidates links already in inboxes. The
    // by-address form below is the way back.
  }

  if (email && looksLikeEmail(email)) {
    const key = emailKey(email);
    await suppress({
      email,
      reason: "UNSUBSCRIBE",
      source: "unsubscribe form",
    });
    const lead = await prisma.lead.findUnique({ where: { emailKey: key } });
    if (lead) {
      await recordTimeline({
        kind: "UNSUBSCRIBE",
        summary: "Unsubscribed using the form",
        actorKind: "CONTACT",
        leadId: lead.id,
      });
    }
    return answer(request, true, DONE);
  }

  return answer(
    request,
    false,
    "That link could not be verified. Open the unsubscribe page and enter your address instead.",
  );
}
