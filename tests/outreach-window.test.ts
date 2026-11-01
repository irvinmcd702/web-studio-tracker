import { describe, expect, it } from "vitest";

import {
  allowance,
  allowedDays,
  describeWindow,
  inSendWindow,
  inZone,
  startOfLocalDay,
  TICK_CEILING,
  type ThrottleRules,
} from "../lib/outreach-window";

const WEEKDAYS: ThrottleRules = {
  windowStartHour: 9,
  windowEndHour: 17,
  windowDays: "1,2,3,4,5",
  timezone: "Europe/Berlin",
  dailyCap: 30,
  minGapMinutes: 6,
};

/** 2026-08-07 is a Friday. */
const at = (iso: string) => new Date(iso);

describe("reading the clock in the campaign's own zone", () => {
  it("converts an instant to local hours and the ISO weekday", () => {
    // 08:30 UTC in August is 10:30 in Berlin, and it is a Friday.
    const parts = inZone(at("2026-08-07T08:30:00Z"), "Europe/Berlin");
    expect(parts).toMatchObject({ hour: 10, minute: 30, weekday: 5 });
    expect(parts.ymd).toBe("2026-08-07");
  });

  it("gives midnight as hour zero rather than 24", () => {
    expect(inZone(at("2026-08-06T22:00:00Z"), "Europe/Berlin").hour).toBe(0);
  });

  it("puts a late instant on the next local day", () => {
    // 23:30 UTC is already the 8th in Berlin.
    expect(inZone(at("2026-08-07T23:30:00Z"), "Europe/Berlin").ymd).toBe(
      "2026-08-08",
    );
  });

  it("follows the same instant into a different zone", () => {
    const instant = at("2026-08-07T08:30:00Z");
    expect(inZone(instant, "UTC").hour).toBe(8);
    expect(inZone(instant, "Europe/Berlin").hour).toBe(10);
    expect(inZone(instant, "America/New_York").hour).toBe(4);
  });
});

describe("the send window", () => {
  it("opens inside the hours and closes outside them", () => {
    // 07:00 UTC = 09:00 Berlin, the first allowed hour.
    expect(inSendWindow(WEEKDAYS, at("2026-08-07T07:00:00Z"))).toBe(true);
    // 14:59 UTC = 16:59 Berlin, the last.
    expect(inSendWindow(WEEKDAYS, at("2026-08-07T14:59:00Z"))).toBe(true);
    // 15:00 UTC = 17:00 Berlin — the end hour is exclusive.
    expect(inSendWindow(WEEKDAYS, at("2026-08-07T15:00:00Z"))).toBe(false);
    expect(inSendWindow(WEEKDAYS, at("2026-08-07T06:59:00Z"))).toBe(false);
  });

  it("holds the same local hours across a daylight-saving change", () => {
    // Europe/Berlin is UTC+2 in August and UTC+1 in December. The window is
    // written in local hours, so the UTC instant it opens at has to move.
    const winter = at("2026-12-04T08:00:00Z"); // 09:00 Berlin, a Friday
    const summer = at("2026-08-07T08:00:00Z"); // 10:00 Berlin, a Friday
    expect(inSendWindow(WEEKDAYS, winter)).toBe(true);
    expect(inSendWindow(WEEKDAYS, summer)).toBe(true);

    // 07:00 UTC is 08:00 in December — before the window opens.
    expect(inSendWindow(WEEKDAYS, at("2026-12-04T07:00:00Z"))).toBe(false);
  });

  it("refuses a day that is not in the mask", () => {
    // 2026-08-08 is a Saturday.
    expect(inSendWindow(WEEKDAYS, at("2026-08-08T10:00:00Z"))).toBe(false);
    expect(
      inSendWindow({ ...WEEKDAYS, windowDays: "6,7" }, at("2026-08-08T10:00:00Z")),
    ).toBe(true);
  });

  it("treats an empty mask as a pause rather than as every day", () => {
    expect(inSendWindow({ ...WEEKDAYS, windowDays: "" }, at("2026-08-07T10:00:00Z")))
      .toBe(false);
    expect(allowedDays("")).toEqual([]);
    expect(allowedDays("1, 2 ,9,x,5")).toEqual([1, 2, 5]);
  });

  it("treats a backwards window as empty rather than wrapping midnight", () => {
    // Wrapping would mean a campaign quietly sending at 3am because somebody
    // typed the hours the wrong way round.
    const backwards = { ...WEEKDAYS, windowStartHour: 17, windowEndHour: 9 };
    for (const hour of ["01", "08", "12", "20"]) {
      expect(inSendWindow(backwards, at(`2026-08-07T${hour}:00:00Z`))).toBe(false);
    }
  });
});

describe("the start of a local day", () => {
  it("walks back to local midnight, not UTC midnight", () => {
    const start = startOfLocalDay(at("2026-08-07T08:30:00Z"), "Europe/Berlin");
    // Local midnight on the 7th in Berlin is 22:00 UTC on the 6th.
    expect(start.toISOString()).toBe("2026-08-06T22:00:00.000Z");
  });
});

describe("how many this tick may send", () => {
  const base = {
    campaign: WEEKDAYS,
    sentToday: 0,
    lastSentAt: null,
    studioRemaining: 100,
    now: at("2026-08-07T10:00:00Z"),
  };

  it("is nothing outside the window", () => {
    expect(allowance({ ...base, now: at("2026-08-08T10:00:00Z") })).toBe(0);
  });

  it("is capped per tick even with nothing sent yet", () => {
    // Otherwise the first tick after enrolling a thousand leads would try to
    // send a thousand messages in one request.
    expect(allowance(base)).toBe(TICK_CEILING);
  });

  it("stops at the campaign's own daily cap", () => {
    expect(allowance({ ...base, sentToday: 28 })).toBe(2);
    expect(allowance({ ...base, sentToday: 30 })).toBe(0);
    expect(allowance({ ...base, sentToday: 31 })).toBe(0);
  });

  it("stops at the studio ceiling even when the campaign has room", () => {
    expect(allowance({ ...base, studioRemaining: 3 })).toBe(3);
    expect(allowance({ ...base, studioRemaining: 0 })).toBe(0);
  });

  it("counts the quiet time since the last message", () => {
    const now = at("2026-08-07T10:00:00Z");
    // Six minutes of gap: one message per six minutes elapsed.
    expect(
      allowance({ ...base, now, lastSentAt: at("2026-08-07T09:59:00Z") }),
    ).toBe(0);
    expect(
      allowance({ ...base, now, lastSentAt: at("2026-08-07T09:54:00Z") }),
    ).toBe(1);
    expect(
      allowance({ ...base, now, lastSentAt: at("2026-08-07T09:42:00Z") }),
    ).toBe(3);
  });

  it("treats a zero gap as one minute rather than dividing by zero", () => {
    const rules = { ...WEEKDAYS, minGapMinutes: 0 };
    expect(
      allowance({
        ...base,
        campaign: rules,
        lastSentAt: at("2026-08-07T09:58:00Z"),
      }),
    ).toBe(2);
  });
});

describe("the window in words", () => {
  it("says the hours, the zone and the pace", () => {
    expect(describeWindow(WEEKDAYS)).toBe(
      "Weekdays, 09:00–17:00 Europe/Berlin, at most 30 a day, at least 6 minutes apart.",
    );
  });

  it("admits when the requested gap is finer than the scheduler runs", () => {
    // The interface says so rather than letting somebody discover it from the
    // timestamps.
    const tight = describeWindow({ ...WEEKDAYS, minGapMinutes: 2 });
    expect(tight).toContain("every 5 minutes");
    expect(tight).toContain("cannot be honoured");
  });

  it("names a backwards window as sending nothing", () => {
    expect(
      describeWindow({ ...WEEKDAYS, windowStartHour: 17, windowEndHour: 9 }),
    ).toContain("no hours");
  });

  it("says No days for an empty mask", () => {
    expect(describeWindow({ ...WEEKDAYS, windowDays: "" })).toContain("No days");
  });
});
