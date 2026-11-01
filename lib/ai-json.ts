/**
 * Reading a JSON answer out of a model.
 *
 * Models that are asked for JSON usually give it, and sometimes wrap it in a
 * fenced code block, and occasionally introduce it with a sentence. The first
 * two are worth tolerating; the third is not — a model that has started
 * explaining itself is a model that has stopped following the instruction, and
 * digging an object out of the middle of an apology is how a summary ends up
 * containing a sentence nobody wrote.
 *
 * So: fences are stripped, whitespace is ignored, and anything else fails.
 */

export type JsonResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function readJson<T>(text: string): JsonResult<T> {
  let body = text.trim();

  // ```json … ``` or plain ``` … ```
  const fenced = body.match(/^```(?:json)?\s*\n([\s\S]*?)\n?```$/);
  if (fenced) body = fenced[1]!.trim();

  if (!body.startsWith("{") && !body.startsWith("[")) {
    return {
      ok: false,
      error: "The model answered with prose rather than the object asked for",
    };
  }

  try {
    return { ok: true, value: JSON.parse(body) as T };
  } catch {
    return { ok: false, error: "The model's answer was not valid JSON" };
  }
}

/** One string field, trimmed and bounded, or null. */
export function readString(
  value: unknown,
  { max = 8000 }: { max?: number } = {},
) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

/** One value from a fixed set, or null. Never a value the caller did not list. */
export function readOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}
