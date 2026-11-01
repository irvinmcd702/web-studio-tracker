import { createHash, createHmac, timingSafeEqual } from "crypto";

/**
 * Reading what a forge sends us.
 *
 * Everything here is pure: signature checking, pulling ticket keys out of the
 * places developers actually put them, and turning a payload into an intent
 * ("this pull request opened, it mentions ACME-14, here is the link"). The
 * database work lives in the route, so this file can be tested on its own.
 *
 * Two providers are supported because they cover what small studios use:
 * GitHub (HMAC-SHA256 in `X-Hub-Signature-256`) and GitLab (a shared token in
 * `X-Gitlab-Token`).
 */

export type GitIntent = {
  kind: "opened" | "merged" | "closed" | "pushed";
  /** Ticket keys found, uppercased and de-duplicated. */
  keys: string[];
  /** Human sentence for the ticket comment. */
  summary: string;
  url: string | null;
  branch: string | null;
  /** Email of whoever did it, when the forge tells us. */
  authorEmail: string | null;
  authorName: string | null;
  /** Forge username, which is all a pull-request payload gives us. */
  authorLogin: string | null;
};

/** `ACME-14` anywhere in a branch name, a title or a commit message. */
const KEY_PATTERN = /\b([A-Z][A-Z0-9]{1,9})-(\d{1,6})\b/g;

export function extractTicketKeys(...sources: (string | null | undefined)[]) {
  const found = new Set<string>();

  for (const source of sources) {
    if (!source) continue;
    // Branch names are usually lower case: acme-14-fix-address.
    for (const match of source.toUpperCase().matchAll(KEY_PATTERN)) {
      found.add(`${match[1]}-${Number(match[2])}`);
    }
  }

  return [...found];
}

export function verifyGitHubSignature(
  body: string,
  signature: string | null,
  secret: string,
) {
  if (!signature) return false;

  const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);

  // Length differs → definitely wrong, and timingSafeEqual would throw.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function verifyGitLabToken(token: string | null, secret: string) {
  if (!token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

type Headers = { get(name: string): string | null };

/**
 * A stable id for this delivery, so the same payload cannot be processed
 * twice. Both forges send one; if a proxy strips it we fall back to a hash of
 * the body, which still stops a verbatim replay.
 */
export function deliveryId(headers: Headers, body: string) {
  const header =
    headers.get("x-github-delivery") ?? headers.get("x-gitlab-event-uuid");

  return header
    ? `hdr:${header}`
    : `sha:${createHash("sha256").update(body).digest("hex")}`;
}

export function detectProvider(headers: Headers) {
  if (headers.get("x-github-event")) return "github" as const;
  if (headers.get("x-gitlab-event")) return "gitlab" as const;
  return null;
}

/** Turns a GitHub payload into an intent, or null when we don't care about it. */
export function readGitHubEvent(
  event: string,
  payload: Record<string, unknown>,
): GitIntent | null {
  if (event === "pull_request") {
    const pr = (payload.pull_request ?? {}) as Record<string, unknown>;
    const action = String(payload.action ?? "");
    const merged = pr.merged === true;

    const title = String(pr.title ?? "");
    const branch = String(
      (pr.head as Record<string, unknown> | undefined)?.ref ?? "",
    );
    const url = typeof pr.html_url === "string" ? pr.html_url : null;
    const number = pr.number;
    const sender = (payload.sender ?? {}) as Record<string, unknown>;
    const user = (pr.user ?? {}) as Record<string, unknown>;

    const author = {
      authorName: String(sender.login ?? user.login ?? "") || null,
      authorEmail: null,
      authorLogin: String(sender.login ?? user.login ?? "") || null,
    };

    const keys = extractTicketKeys(branch, title);
    if (keys.length === 0) return null;

    if (
      action === "opened" ||
      action === "reopened" ||
      action === "ready_for_review"
    ) {
      return {
        kind: "opened",
        keys,
        summary: `Pull request #${number} opened: ${title}`,
        url,
        branch: branch || null,
        ...author,
      };
    }

    if (action === "closed" && merged) {
      return {
        kind: "merged",
        keys,
        summary: `Pull request #${number} merged: ${title}`,
        url,
        branch: branch || null,
        ...author,
      };
    }

    if (action === "closed") {
      return {
        kind: "closed",
        keys,
        summary: `Pull request #${number} closed without merging: ${title}`,
        url,
        branch: branch || null,
        ...author,
      };
    }

    return null;
  }

  if (event === "push") {
    const ref = String(payload.ref ?? "");
    const branch = ref.replace(/^refs\/heads\//, "");
    const commits = Array.isArray(payload.commits) ? payload.commits : [];
    const messages = commits.map((c) =>
      String((c as Record<string, unknown>).message ?? ""),
    );

    const keys = extractTicketKeys(branch, ...messages);
    if (keys.length === 0) return null;

    const pusher = (payload.pusher ?? {}) as Record<string, unknown>;
    const first = (commits[0] ?? {}) as Record<string, unknown>;

    return {
      kind: "pushed",
      keys,
      summary:
        commits.length === 1
          ? `Pushed to ${branch}: ${messages[0]?.split("\n")[0] ?? ""}`
          : `Pushed ${commits.length} commits to ${branch}`,
      url: typeof first.url === "string" ? first.url : null,
      branch,
      authorEmail: typeof pusher.email === "string" ? pusher.email : null,
      authorName: typeof pusher.name === "string" ? pusher.name : null,
      authorLogin: typeof pusher.name === "string" ? pusher.name : null,
    };
  }

  return null;
}

/** The same for GitLab, whose payloads are shaped differently enough to matter. */
export function readGitLabEvent(
  payload: Record<string, unknown>,
): GitIntent | null {
  const kind = String(payload.object_kind ?? "");
  const user = (payload.user ?? {}) as Record<string, unknown>;

  if (kind === "merge_request") {
    const attrs = (payload.object_attributes ?? {}) as Record<string, unknown>;
    const state = String(attrs.state ?? "");
    const action = String(attrs.action ?? "");
    const title = String(attrs.title ?? "");
    const branch = String(attrs.source_branch ?? "");
    const url = typeof attrs.url === "string" ? attrs.url : null;
    const iid = attrs.iid;

    const keys = extractTicketKeys(branch, title);
    if (keys.length === 0) return null;

    const author = {
      authorEmail: typeof user.email === "string" ? user.email : null,
      authorName: typeof user.name === "string" ? user.name : null,
      authorLogin: typeof user.username === "string" ? user.username : null,
    };

    if (action === "open" || action === "reopen") {
      return {
        kind: "opened",
        keys,
        summary: `Merge request !${iid} opened: ${title}`,
        url,
        branch: branch || null,
        ...author,
      };
    }

    if (state === "merged" || action === "merge") {
      return {
        kind: "merged",
        keys,
        summary: `Merge request !${iid} merged: ${title}`,
        url,
        branch: branch || null,
        ...author,
      };
    }

    if (state === "closed" || action === "close") {
      return {
        kind: "closed",
        keys,
        summary: `Merge request !${iid} closed without merging: ${title}`,
        url,
        branch: branch || null,
        ...author,
      };
    }

    return null;
  }

  if (kind === "push") {
    const ref = String(payload.ref ?? "");
    const branch = ref.replace(/^refs\/heads\//, "");
    const commits = Array.isArray(payload.commits) ? payload.commits : [];
    const messages = commits.map((c) =>
      String((c as Record<string, unknown>).message ?? ""),
    );

    const keys = extractTicketKeys(branch, ...messages);
    if (keys.length === 0) return null;

    const first = (commits[0] ?? {}) as Record<string, unknown>;
    const author = (first.author ?? {}) as Record<string, unknown>;

    return {
      kind: "pushed",
      keys,
      summary:
        commits.length === 1
          ? `Pushed to ${branch}: ${messages[0]?.split("\n")[0] ?? ""}`
          : `Pushed ${commits.length} commits to ${branch}`,
      url: typeof first.url === "string" ? first.url : null,
      branch,
      authorEmail:
        typeof author.email === "string"
          ? author.email
          : typeof payload.user_email === "string"
            ? payload.user_email
            : null,
      authorName:
        typeof author.name === "string"
          ? author.name
          : typeof payload.user_name === "string"
            ? payload.user_name
            : null,
      authorLogin:
        typeof payload.user_username === "string"
          ? payload.user_username
          : null,
    };
  }

  return null;
}

/**
 * A branch name a person can type and a machine can parse back.
 *
 * `ACME-14 Delivery address is lost on mobile` → `acme-14-delivery-address-is-lost`
 */
export function branchNameFor(key: string, title: string, maxWords = 6) {
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, maxWords);

  return [key.toLowerCase(), ...words].join("-");
}
