import { createHash, randomBytes } from "crypto";
import type { ApiScope } from "@prisma/client";

import { prisma } from "./db";
import type { SessionUser } from "./auth";

/**
 * Bearer tokens for the JSON API, used by coding agents and scripts.
 *
 * A token is not an identity of its own: it acts as the person who created it
 * and inherits their project scope exactly. An agent can never read more than
 * the developer who issued it, which is the only sane default when the thing
 * holding the token writes its own requests.
 *
 * Only a SHA-256 hash is stored. The plaintext is shown once and never again,
 * the same way invite links already work.
 */

export const TOKEN_PREFIX = "stk_";

export type TokenActor = SessionUser & {
  token: { id: string; name: string; kind: "PERSONAL" | "AGENT" };
  scopes: ApiScope[];
};

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function issueApiToken({
  userId,
  name,
  kind,
  scopes,
  expiresAt,
}: {
  userId: string;
  name: string;
  kind: "PERSONAL" | "AGENT";
  scopes: ApiScope[];
  expiresAt?: Date | null;
}) {
  const token = `${TOKEN_PREFIX}${randomBytes(24).toString("base64url")}`;

  const record = await prisma.apiToken.create({
    data: {
      userId,
      name,
      kind,
      scopes,
      tokenHash: hashToken(token),
      // Enough to recognise a row in a list, far too little to reconstruct.
      prefix: token.slice(0, TOKEN_PREFIX.length + 6),
      expiresAt: expiresAt ?? null,
    },
  });

  return { token, record };
}

export type AuthFailure =
  | "missing"
  | "malformed"
  | "unknown"
  | "revoked"
  | "expired"
  | "inactive"
  | "forbidden_role";

/**
 * Resolves a bearer token to the person it acts as. Returns a reason rather
 * than throwing, so the route can answer 401 with something a developer can
 * act on.
 */
export async function authenticateToken(
  header: string | null,
): Promise<{ actor: TokenActor } | { error: AuthFailure }> {
  if (!header) return { error: "missing" };

  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!match) return { error: "malformed" };

  const token = match[1]!;
  if (!token.startsWith(TOKEN_PREFIX)) return { error: "malformed" };

  const record = await prisma.apiToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });

  if (!record) return { error: "unknown" };
  if (record.revokedAt) return { error: "revoked" };
  if (record.expiresAt && record.expiresAt < new Date()) {
    return { error: "expired" };
  }
  if (!record.user.isActive) return { error: "inactive" };
  // The portal is a person-facing surface; there is no reason to script it.
  if (record.user.role === "CLIENT") return { error: "forbidden_role" };

  // Best effort: a busy agent shouldn't pay for a write on every read.
  const staleBy = record.lastUsedAt
    ? Date.now() - record.lastUsedAt.getTime()
    : Infinity;
  if (staleBy > 60_000) {
    prisma.apiToken
      .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {});
  }

  return {
    actor: {
      id: record.user.id,
      email: record.user.email,
      name: record.user.name,
      role: record.user.role,
      clientId: record.user.clientId,
      avatarColor: record.user.avatarColor,
      position: record.user.position,
      token: { id: record.id, name: record.name, kind: record.kind },
      scopes: record.scopes,
    } as TokenActor,
  };
}

export const AUTH_FAILURES: Record<AuthFailure, string> = {
  missing: "Send an Authorization: Bearer <token> header",
  malformed: `Expected "Authorization: Bearer ${TOKEN_PREFIX}…"`,
  unknown: "This token doesn't exist",
  revoked: "This token was revoked",
  expired: "This token has expired",
  inactive: "The account this token belongs to is deactivated",
  forbidden_role: "Client accounts cannot use the API",
};

export function canWrite(actor: TokenActor) {
  return actor.scopes.includes("WRITE");
}
