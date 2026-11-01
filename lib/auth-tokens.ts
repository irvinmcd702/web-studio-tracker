import { createHash, randomBytes, timingSafeEqual } from "crypto";
import type { AuthTokenKind } from "@prisma/client";

import { prisma } from "./db";
import { appUrl } from "./rocketchat";

/**
 * One-time links for invites and password resets.
 *
 * The raw token is shown once and never stored — only its SHA-256 hash goes to
 * the database, so a leaked dump can't be replayed into account access.
 */

export const TOKEN_TTL_MS: Record<AuthTokenKind, number> = {
  INVITE: 7 * 24 * 60 * 60 * 1000,
  RESET: 2 * 60 * 60 * 1000,
};

export function hashToken(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

/** Constant-time compare, so timing can't be used to guess a token. */
export function tokensMatch(a: string, b: string) {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export type IssuedToken = {
  token: string;
  url: string;
  expiresAt: Date;
};

export async function issueAuthToken(input: {
  userId: string;
  kind: AuthTokenKind;
  createdById?: string | null;
}): Promise<IssuedToken> {
  // Any previously issued link of the same kind stops working immediately.
  await prisma.authToken.deleteMany({
    where: { userId: input.userId, kind: input.kind, usedAt: null },
  });

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS[input.kind]);

  await prisma.authToken.create({
    data: {
      userId: input.userId,
      kind: input.kind,
      tokenHash: hashToken(token),
      expiresAt,
      createdById: input.createdById ?? null,
    },
  });

  return { token, url: appUrl(`/set-password/${token}`), expiresAt };
}

export type TokenFailure = "invalid" | "used" | "expired" | "inactive";

export type TokenLookup =
  | {
      ok: true;
      tokenId: string;
      kind: AuthTokenKind;
      user: { id: string; name: string; email: string };
    }
  | { ok: false; reason: TokenFailure };

export async function lookupAuthToken(raw: string): Promise<TokenLookup> {
  if (!raw || raw.length < 20) return { ok: false, reason: "invalid" };

  const record = await prisma.authToken.findUnique({
    where: { tokenHash: hashToken(raw) },
    include: { user: true },
  });

  if (!record) return { ok: false, reason: "invalid" };
  if (record.usedAt) return { ok: false, reason: "used" };
  if (record.expiresAt.getTime() < Date.now())
    return { ok: false, reason: "expired" };
  if (!record.user.isActive) return { ok: false, reason: "inactive" };

  return {
    ok: true,
    tokenId: record.id,
    kind: record.kind,
    user: {
      id: record.user.id,
      name: record.user.name,
      email: record.user.email,
    },
  };
}

export const TOKEN_ERRORS: Record<TokenFailure, string> = {
  invalid: "This link is not valid. Ask for a new one.",
  used: "This link has already been used. Ask for a new one.",
  expired: "This link has expired. Ask for a new one.",
  inactive: "This account is disabled. Contact your manager.",
};
