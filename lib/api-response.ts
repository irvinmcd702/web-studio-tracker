import type { NextRequest } from "next/server";

import {
  AUTH_FAILURES,
  authenticateToken,
  canWrite,
  type TokenActor,
} from "./api-tokens";
import { checkApiRate } from "./api-rate-limit";

/**
 * The shared shape of every `/api/v1` answer.
 *
 * Errors carry a machine-readable `error` and a sentence a developer (or an
 * agent reading the response) can act on, because "400 Bad Request" tells
 * nobody which field was wrong.
 */

export function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, {
    ...init,
    headers: { "Cache-Control": "no-store", ...(init?.headers ?? {}) },
  });
}

export function fail(
  status: number,
  error: string,
  message: string,
  extra?: Record<string, unknown>,
) {
  return json({ error, message, ...extra }, { status });
}

type RouteContext = { params: Promise<Record<string, string>> };

type Handler = (ctx: {
  actor: TokenActor;
  request: NextRequest;
  params: Record<string, string>;
}) => Promise<Response>;

/**
 * Wraps a route in token authentication. `write: true` additionally requires
 * the token to carry the WRITE scope, so a read-only agent cannot move a
 * ticket even if it guesses the URL.
 */
export function withToken(handler: Handler, { write = false } = {}) {
  return async (request: NextRequest, context: RouteContext) => {
    const result = await authenticateToken(
      request.headers.get("authorization"),
    );

    if ("error" in result) {
      return fail(401, result.error, AUTH_FAILURES[result.error]);
    }

    const rate = checkApiRate(result.actor.token.id, { write });
    if (!rate.ok) {
      // Retry-After so a well-behaved client waits instead of spinning.
      return json(
        {
          error: "rate_limited",
          message: `Too many requests for this token. Try again in ${rate.retryAfterSeconds}s.`,
          limitPerMinute: rate.limit,
        },
        {
          status: 429,
          headers: { "Retry-After": String(rate.retryAfterSeconds) },
        },
      );
    }

    if (write && !canWrite(result.actor)) {
      return fail(
        403,
        "read_only",
        "This token has the READ scope only. Issue a token with WRITE to change anything.",
      );
    }

    try {
      const params = context?.params ? await context.params : {};
      return await handler({ actor: result.actor, request, params });
    } catch (e) {
      // The detail goes to the log, not to the caller: an internal error
      // message can carry query shapes and column names.
      console.error("[api/v1]", request.nextUrl.pathname, e);
      return fail(
        500,
        "server_error",
        "Something went wrong on the tracker's side. The details are in the server log.",
      );
    }
  };
}

export async function readJson<T>(request: NextRequest): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}
