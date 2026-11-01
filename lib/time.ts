/**
 * Week/day helpers for the timesheet. Everything works in the server's local
 * time zone and stores work logs at local noon, which keeps a day's entries on
 * that day regardless of UTC offset.
 */

export const WEEK_DAYS = 7;

/** `YYYY-MM-DD` in local time — the key a timesheet cell is addressed by. */
export function dayKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Local noon of the given day key, safe to store in a DateTime column. */
export function dayKeyToDate(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** Monday 00:00 of the week the date belongs to. */
export function weekStart(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  // getDay(): 0 = Sunday, so Sunday belongs to the week that began 6 days ago.
  const offset = (start.getDay() + 6) % 7;
  return addDays(start, -offset);
}

export function weekEnd(start: Date) {
  const end = addDays(start, WEEK_DAYS - 1);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function weekDays(start: Date) {
  return Array.from({ length: WEEK_DAYS }, (_, i) => addDays(start, i));
}

/** Reads `?week=YYYY-MM-DD`, falling back to the current week. */
export function parseWeekParam(value: string | undefined) {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return weekStart(dayKeyToDate(value));
  }
  return weekStart(new Date());
}

export function isWeekend(date: Date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

export function isSameDay(a: Date, b: Date) {
  return dayKey(a) === dayKey(b);
}

export function shortDayLabel(date: Date) {
  return date.toLocaleDateString("en-US", { weekday: "short" });
}

export function shortDateLabel(date: Date) {
  return date.toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

/** `1:05:09` from a millisecond span — for the live timer readout. */
export function formatElapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Elapsed milliseconds → hours, rounded to whole minutes. */
export function msToHours(ms: number) {
  return Math.round(ms / 60000) / 60;
}
