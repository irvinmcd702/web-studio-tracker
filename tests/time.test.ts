import { describe, expect, it } from "vitest";

import {
  addDays,
  dayKey,
  dayKeyToDate,
  formatElapsed,
  msToHours,
  parseWeekParam,
  weekDays,
  weekStart,
} from "../lib/time";

describe("weekStart", () => {
  it("returns the same Monday for every day of that week", () => {
    // 2026-08-03 is a Monday.
    const monday = new Date(2026, 7, 3, 9, 30);
    const expected = dayKey(weekStart(monday));

    for (let i = 0; i < 7; i++) {
      expect(dayKey(weekStart(addDays(monday, i)))).toBe(expected);
    }
  });

  it("treats Sunday as the end of the week, not the start", () => {
    const sunday = new Date(2026, 7, 9); // Sunday
    const start = weekStart(sunday);
    expect(start.getDay()).toBe(1);
    expect(dayKey(start)).toBe("2026-08-03");
  });

  it("crosses a month boundary correctly", () => {
    // 2026-09-01 is a Tuesday, so its week starts in August.
    expect(dayKey(weekStart(new Date(2026, 8, 1)))).toBe("2026-08-31");
  });

  it("starts at midnight and spans exactly seven days", () => {
    const start = weekStart(new Date(2026, 7, 5, 23, 59));
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);

    const days = weekDays(start);
    expect(days).toHaveLength(7);
    expect(dayKey(days[0]!)).toBe("2026-08-03");
    expect(dayKey(days[6]!)).toBe("2026-08-09");
  });
});

describe("dayKey / dayKeyToDate", () => {
  it("round-trips a date", () => {
    expect(dayKey(dayKeyToDate("2026-02-09"))).toBe("2026-02-09");
  });

  it("pads single digits", () => {
    expect(dayKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("stores at local noon so a timezone offset can't shift the day", () => {
    expect(dayKeyToDate("2026-03-15").getHours()).toBe(12);
  });
});

describe("parseWeekParam", () => {
  it("falls back to the current week for junk input", () => {
    const current = dayKey(weekStart(new Date()));
    expect(dayKey(parseWeekParam(undefined))).toBe(current);
    expect(dayKey(parseWeekParam("not-a-date"))).toBe(current);
    expect(dayKey(parseWeekParam("2026-13-99x"))).toBe(current);
  });

  it("snaps a mid-week date to that week's Monday", () => {
    expect(dayKey(parseWeekParam("2026-08-06"))).toBe("2026-08-03");
  });
});

describe("msToHours", () => {
  it("rounds to whole minutes", () => {
    expect(msToHours(90 * 60_000)).toBe(1.5);
    expect(msToHours(60_000)).toBeCloseTo(1 / 60, 5);
    // 89 seconds is a minute and a half of wall clock → rounds to 1 minute.
    expect(msToHours(89_000)).toBeCloseTo(1 / 60, 5);
    expect(msToHours(91_000)).toBeCloseTo(2 / 60, 5);
  });
});

describe("formatElapsed", () => {
  it("pads minutes and seconds", () => {
    expect(formatElapsed(0)).toBe("0:00:00");
    expect(formatElapsed(65_000)).toBe("0:01:05");
    expect(formatElapsed(3_725_000)).toBe("1:02:05");
  });

  it("never goes negative on a clock skew", () => {
    expect(formatElapsed(-5000)).toBe("0:00:00");
  });
});
