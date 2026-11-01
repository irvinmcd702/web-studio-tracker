import { createHash, createHmac, timingSafeEqual } from "crypto";

/**
 * Reading what a mail provider sends back.
 *
 * Everything here is pure — signature checking, working out which of the three
 * providers sent it, and turning a payload into one plain object. The database
 * work lives in the route, so this file can be tested without one, exactly as
 * `lib/git-events.ts` is.
 *
 * Three providers, because they are what a small studio actually ends up with,
 * and their authentication is not equally good. That is said out loud below
 * rather than papered over.
 */

export type InboundProvider = "mailgun" | "postmark" | "svix";

export type InboundKind =
  | "reply"
  | "hard_bounce"
  | "soft_bounce"
  | "complaint"
  | "unsubscribe"
  | "other";

export type InboundEvent = {
  kind: InboundKind;
  /** Who wrote, as far as the provider knows. */
  fromEmail: string | null;
  /** Every recipient address on the message, so a `+token` can be found. */
  toAddresses: string[];
  subject: string;
  body: string;
  /** The provider's own message id, for the replay guard. */
  providerId: string | null;
  rfcMessageId: string | null;
  inReplyTo: string | null;
  /** The `References` header verbatim; ids are pulled out of it separately. */
  referencesRaw: string | null;
};

type Headers = { get(name: string): string | null };

/** Longer than this is not a record worth keeping whole. */
export const MAX_BODY_CHARS = 20_000;
/** Longer than this is not a payload worth reading at all. */
export const MAX_PAYLOAD_BYTES = 512 * 1024;

/** Providers get five minutes of clock skew, and no more. */
const TIMESTAMP_WINDOW_MS = 5 * 60_000;

export function detectProvider(
  headers: Headers,
  payload: unknown,
): InboundProvider | null {
  if (headers.get("svix-id") || headers.get("webhook-id")) return "svix";
  if (headers.get("x-postmark-webhook") || headers.get("x-pm-signature")) {
    return "postmark";
  }

  const body = payload as Record<string, unknown> | null;
  if (body && typeof body === "object") {
    if ("signature" in body && "event-data" in body) return "mailgun";
    // Postmark posts a bare object with these, and signs nothing.
    if ("RecordType" in body || "MessageStream" in body) return "postmark";
  }

  return null;
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

/**
 * Mailgun signs `timestamp + token` rather than the body, so a captured
 * signature is only good until the window closes.
 */
export function verifyMailgun(
  payload: unknown,
  secret: string,
  now = Date.now(),
) {
  const body = payload as { signature?: Record<string, string> };
  const sig = body?.signature;
  if (!sig?.timestamp || !sig.token || !sig.signature) return false;

  const seconds = Number(sig.timestamp);
  if (!Number.isFinite(seconds)) return false;
  if (Math.abs(now - seconds * 1000) > TIMESTAMP_WINDOW_MS) return false;

  const expected = createHmac("sha256", secret)
    .update(`${sig.timestamp}${sig.token}`)
    .digest("hex");

  return safeEqual(expected, sig.signature);
}

/**
 * Postmark signs nothing.
 *
 * There is no HMAC to check, so the only thing standing between this endpoint
 * and the internet is a secret in the URL or in Basic auth. **That is weaker
 * than the other two** — it travels with every request, it ends up in access
 * logs, and it cannot detect a modified body. The secret must therefore be
 * long and random, and the settings screen generates one rather than letting
 * anybody type a memorable phrase.
 */
export function verifyPostmark(
  offered: string | null,
  secret: string,
): boolean {
  if (!offered) return false;
  return safeEqual(offered, secret);
}

/**
 * Svix, which is what Resend uses. Base64 HMAC over `id.timestamp.body`, and
 * the header may carry several space-separated signatures during a rotation —
 * any one of them matching is enough.
 */
export function verifySvix(
  raw: string,
  headers: Headers,
  secret: string,
  now = Date.now(),
) {
  const id = headers.get("svix-id") ?? headers.get("webhook-id");
  const timestamp =
    headers.get("svix-timestamp") ?? headers.get("webhook-timestamp");
  const offered =
    headers.get("svix-signature") ?? headers.get("webhook-signature");

  if (!id || !timestamp || !offered) return false;

  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds)) return false;
  if (Math.abs(now - seconds * 1000) > TIMESTAMP_WINDOW_MS) return false;

  // Svix secrets are conventionally prefixed and base64 after it.
  const key = secret.startsWith("whsec_")
    ? Buffer.from(secret.slice(6), "base64")
    : Buffer.from(secret);

  const expected = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${raw}`)
    .digest("base64");

  return offered
    .split(" ")
    .map((part) => (part.includes(",") ? part.split(",")[1]! : part))
    .some((candidate) => safeEqual(expected, candidate));
}

/**
 * A stable id for this delivery, namespaced so it cannot collide with the git
 * webhook's ids in the same table. Falls back to a hash of the body when the
 * provider sends nothing usable, which still stops a verbatim replay.
 */
export function deliveryId(event: InboundEvent | null, raw: string) {
  const id = event?.providerId ?? event?.rfcMessageId;
  return id
    ? `outreach:${id}`
    : `outreach:${createHash("sha256").update(raw).digest("hex")}`;
}

const str = (value: unknown) => (typeof value === "string" ? value : null);

/** Every address in a To/Cc-style value, however the provider formatted it. */
export function readAddresses(...values: (string | null | undefined)[]) {
  const found: string[] = [];
  for (const value of values) {
    if (!value) continue;
    for (const match of value.matchAll(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g)) {
      found.push(match[0]!.toLowerCase());
    }
  }
  return [...new Set(found)];
}

/** The `+token` part of `outreach+abc123@hi.studio.example`, if there is one. */
export function readReplyToken(addresses: string[]): string | null {
  for (const address of addresses) {
    const at = address.indexOf("@");
    const plus = address.indexOf("+");
    if (plus > 0 && at > plus) {
      const token = address.slice(plus + 1, at);
      if (token) return token;
    }
  }
  return null;
}

/** Message ids out of an `In-Reply-To` and a `References` header. */
export function readMessageIds(...values: (string | null | undefined)[]) {
  const found: string[] = [];
  for (const value of values) {
    if (!value) continue;
    for (const match of value.matchAll(/<[^<>\s]+>/g)) found.push(match[0]!);
  }
  return [...new Set(found)];
}

function truncate(body: string) {
  return body.length > MAX_BODY_CHARS
    ? { body: body.slice(0, MAX_BODY_CHARS), truncated: true }
    : { body, truncated: false };
}

/**
 * A bounce that will never succeed, versus one that might.
 *
 * The distinction matters because a hard bounce suppresses the address at
 * once, and a soft one only counts towards it. Getting this wrong in the
 * generous direction means writing to an address that does not exist; in the
 * strict direction it means never writing to somebody whose mailbox was full
 * for an afternoon. Both are wrong, so the mapping is explicit rather than a
 * guess from the text.
 */
function mailgunKind(event: string, severity: string | null): InboundKind {
  if (event === "complained") return "complaint";
  if (event === "unsubscribed") return "unsubscribe";
  if (event === "failed") {
    return severity === "permanent" ? "hard_bounce" : "soft_bounce";
  }
  // "stored" is what an inbound route fires when somebody writes back.
  // "delivered" and "accepted" are telemetry about our own sending and are
  // deliberately not events this endpoint acts on.
  if (event === "stored") return "reply";
  return "other";
}

function postmarkKind(record: string, type: string | null): InboundKind {
  if (record === "SpamComplaint") return "complaint";
  if (record === "SubscriptionChange") return "unsubscribe";
  if (record === "Inbound") return "reply";
  if (record === "Bounce") {
    // Postmark's own vocabulary. Anything it calls Transient is retryable.
    const soft = ["SoftBounce", "Transient", "DnsError", "SMTPApiError"];
    return type && soft.includes(type) ? "soft_bounce" : "hard_bounce";
  }
  return "other";
}

export function normalise(
  provider: InboundProvider,
  payload: unknown,
): InboundEvent | null {
  const body = payload as Record<string, any>;
  if (!body || typeof body !== "object") return null;

  if (provider === "mailgun") {
    const data = body["event-data"] as Record<string, any> | undefined;
    if (!data) return null;

    const message = data.message ?? {};
    const headers = message.headers ?? {};
    const kind = mailgunKind(str(data.event) ?? "", str(data.severity));

    const text = truncate(
      str(data["body-plain"]) ?? str(message["body-plain"]) ?? "",
    );

    return {
      kind,
      fromEmail: readAddresses(str(headers.from))[0] ?? null,
      toAddresses: readAddresses(str(headers.to), str(data.recipient)),
      subject: str(headers.subject) ?? "",
      body: text.body,
      providerId: str(data.id) ?? str(headers["message-id"]),
      rfcMessageId: str(headers["message-id"]),
      inReplyTo: str(headers["in-reply-to"]),
      referencesRaw: str(headers.references),
    };
  }

  if (provider === "postmark") {
    const record = str(body.RecordType) ?? "Inbound";
    const kind = postmarkKind(record, str(body.Type));

    const headerList = Array.isArray(body.Headers) ? body.Headers : [];
    const header = (name: string) =>
      str(
        headerList.find(
          (h: Record<string, unknown>) =>
            typeof h?.Name === "string" &&
            h.Name.toLowerCase() === name.toLowerCase(),
        )?.Value,
      );

    const text = truncate(str(body.TextBody) ?? str(body.Description) ?? "");

    return {
      kind,
      fromEmail: readAddresses(str(body.From), str(body.Email))[0] ?? null,
      toAddresses: readAddresses(
        str(body.To),
        str(body.OriginalRecipient),
        str(body.Recipient),
      ),
      subject: str(body.Subject) ?? "",
      body: text.body,
      providerId: str(body.MessageID) ?? str(body.ID)?.toString() ?? null,
      rfcMessageId: header("message-id"),
      inReplyTo: header("in-reply-to"),
      referencesRaw: header("references"),
    };
  }

  // Svix wraps the real payload; Resend puts the mail event under `data`.
  const data = (body.data ?? body) as Record<string, any>;
  const type = str(body.type) ?? "";
  const kind: InboundKind = type.includes("complained")
    ? "complaint"
    : type.includes("bounced")
      ? "hard_bounce"
      : type.includes("inbound") || type.includes("received")
        ? "reply"
        : "other";

  const text = truncate(str(data.text) ?? str(data.html) ?? "");

  return {
    kind,
    fromEmail: readAddresses(str(data.from))[0] ?? null,
    toAddresses: readAddresses(
      Array.isArray(data.to) ? data.to.join(", ") : str(data.to),
    ),
    subject: str(data.subject) ?? "",
    body: text.body,
    providerId: str(data.email_id) ?? str(data.id),
    rfcMessageId: str(data.message_id),
    inReplyTo: str(data.in_reply_to),
    referencesRaw: str(data.references),
  };
}

/** Whether the stored body had to be cut. Kept beside `normalise` so the two agree. */
export function wasTruncated(body: string) {
  return body.length >= MAX_BODY_CHARS;
}
