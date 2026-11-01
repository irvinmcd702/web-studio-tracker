/**
 * When a campaign may send, and how many.
 *
 * No database in this file, on purpose. The arithmetic here is the part most
 * likely to be wrong — hours across a timezone, a week boundary, a daily cap
 * shared with the studio — and it is the part that is miserable to test
 * through a scheduler. Keeping it pure is the same habit `lib/attention.ts`
 * and `lib/workflow-rules.ts` follow.
 *
 * `Intl.DateTimeFormat` does the timezone work. `date-fns` is a dependency and
 * `date-fns-tz` is not; Node's own ICU data answers this correctly, so nobody
 * needs to add one.
 */

export type WindowRules = {
  windowStartHour: number;
  windowEndHour: number;
  /** ISO weekday numbers as a comma list, "1,2,3,4,5". Monday is 1. */
  windowDays: string;
  timezone: string;
};

export type ThrottleRules = WindowRules & {
  dailyCap: number;
  minGapMinutes: number;
};

/**
 * The most one tick will claim, whatever the arithmetic below allows.
 *
 * Without it, a campaign whose `lastSentAt` is null has an unbounded gap
 * allowance and the first tick after enrolling a thousand leads would try to
 * send a thousand messages in one request.
 */
export const TICK_CEILING = 10;

/** Local wall-clock parts of an instant, in a named zone. */
export function inZone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";

  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  // Intl gives 24 for midnight in some locales; both mean hour zero.
  const hour = Number(get("hour")) % 24;

  return {
    hour,
    minute: Number(get("minute")),
    /** ISO: Monday is 1, Sunday is 7. */
    weekday: weekdays.indexOf(get("weekday")) + 1,
    /** yyyy-mm-dd in the campaign's own zone, for counting a local day. */
    ymd: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

export function allowedDays(windowDays: string): number[] {
  return windowDays
    .split(",")
    .map((d) => Number(d.trim()))
    .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7);
}

export function inSendWindow(rules: WindowRules, now: Date): boolean {
  const { hour, weekday } = inZone(now, rules.timezone);

  if (!allowedDays(rules.windowDays).includes(weekday)) return false;

  // An end at or before the start is an empty window rather than one that
  // wraps midnight. Wrapping would mean a campaign quietly sending at 3am
  // because somebody typed the hours the wrong way round.
  if (rules.windowEndHour <= rules.windowStartHour) return false;

  return hour >= rules.windowStartHour && hour < rules.windowEndHour;
}

/**
 * The instant the campaign's local day began, as a UTC `Date`.
 *
 * Used to count what has already gone out today. Derived by walking back from
 * `now` rather than by constructing a local date, because constructing one
 * needs an offset that changes twice a year.
 */
export function startOfLocalDay(now: Date, timezone: string): Date {
  const { hour, minute } = inZone(now, timezone);
  const start = new Date(now.getTime() - (hour * 60 + minute) * 60_000);
  // Trim to the minute; seconds are noise for a daily count.
  start.setUTCSeconds(0, 0);
  return start;
}

/**
 * How many messages this campaign may send in this tick.
 *
 * `min` of four limits, and each one is a different promise to a different
 * person: the campaign's own pace, the studio's ceiling across everything, the
 * quiet time between two messages, and the per-tick bound above.
 */
export function allowance(input: {
  campaign: ThrottleRules;
  /** Already sent by this campaign in its own local day. */
  sentToday: number;
  /** When this campaign last sent anything, or null. */
  lastSentAt: Date | null;
  /** What the studio's daily ceiling still has left, across all campaigns. */
  studioRemaining: number;
  now: Date;
}): number {
  const { campaign, sentToday, lastSentAt, studioRemaining, now } = input;

  if (!inSendWindow(campaign, now)) return 0;
  if (studioRemaining <= 0) return 0;

  const ownRemaining = campaign.dailyCap - sentToday;
  if (ownRemaining <= 0) return 0;

  const gap = Math.max(1, campaign.minGapMinutes);
  const sinceLast = lastSentAt
    ? Math.floor((now.getTime() - lastSentAt.getTime()) / 60_000)
    : Number.POSITIVE_INFINITY;
  const byGap = Math.floor(sinceLast / gap);
  if (byGap <= 0) return 0;

  return Math.max(
    0,
    Math.min(ownRemaining, studioRemaining, byGap, TICK_CEILING),
  );
}

/**
 * The window in words, for the campaign page.
 *
 * It states the tick interval too, because a campaign asking for a two-minute
 * gap will get five and the interface should say so rather than let somebody
 * discover it from the timestamps.
 */
export function describeWindow(
  rules: ThrottleRules,
  { tickMinutes = 5 }: { tickMinutes?: number } = {},
) {
  const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const days = allowedDays(rules.windowDays);

  const dayText =
    days.length === 0
      ? "No days"
      : days.length === 7
        ? "Every day"
        : days.join(",") === "1,2,3,4,5"
          ? "Weekdays"
          : days.map((d) => names[d - 1]).join(", ");

  const pad = (n: number) => String(n).padStart(2, "0");
  const hours =
    rules.windowEndHour <= rules.windowStartHour
      ? "no hours (the end is not after the start)"
      : `${pad(rules.windowStartHour)}:00–${pad(rules.windowEndHour)}:00 ${rules.timezone}`;

  const sentence =
    `${dayText}, ${hours}, at most ${rules.dailyCap} a day, ` +
    `at least ${rules.minGapMinutes} minutes apart.`;

  return rules.minGapMinutes < tickMinutes
    ? `${sentence} The scheduler runs every ${tickMinutes} minutes, so gaps shorter than that cannot be honoured.`
    : sentence;
}
