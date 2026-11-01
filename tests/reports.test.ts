import { describe, expect, it } from "vitest";

import { resolvePeriod, reportToCsv, type Report } from "../lib/reports";
import { dayKey } from "../lib/time";

describe("resolvePeriod", () => {
  it("defaults to the current month", () => {
    const now = new Date();
    const { from, to, preset } = resolvePeriod({});
    expect(preset).toBe("this-month");
    expect(from.getDate()).toBe(1);
    expect(from.getMonth()).toBe(now.getMonth());
    // Last day of the month: adding a day rolls into the next one.
    expect(new Date(to.getTime() + 1000).getDate()).toBe(1);
  });

  it("handles last month across a year boundary", () => {
    // Can't freeze the clock here, so assert the relationship instead: the end
    // of "last month" is always the day before the start of "this month".
    const thisMonth = resolvePeriod({ preset: "this-month" });
    const lastMonth = resolvePeriod({ preset: "last-month" });
    const dayAfterLast = new Date(lastMonth.to.getTime() + 1000);
    expect(dayKey(dayAfterLast)).toBe(dayKey(thisMonth.from));
  });

  it("returns whole quarters", () => {
    const q = resolvePeriod({ preset: "this-quarter" });
    expect(q.from.getDate()).toBe(1);
    expect(q.from.getMonth() % 3).toBe(0);
    const dayAfter = new Date(q.to.getTime() + 1000);
    expect(dayAfter.getDate()).toBe(1);
    expect(dayAfter.getMonth() % 3).toBe(0);
  });

  it("uses an explicit custom range", () => {
    const { from, to, preset } = resolvePeriod({
      preset: "custom",
      from: "2026-03-10",
      to: "2026-03-20",
    });
    expect(preset).toBe("custom");
    expect(dayKey(from)).toBe("2026-03-10");
    expect(dayKey(to)).toBe("2026-03-20");
    expect(from.getHours()).toBe(0);
    expect(to.getHours()).toBe(23);
  });

  it("ignores a custom range with malformed dates", () => {
    const { preset } = resolvePeriod({
      preset: "custom",
      from: "oops",
      to: "",
    });
    expect(preset).toBe("this-month");
  });
});

function reportWith(entries: Report["entries"]): Report {
  return {
    from: new Date(),
    to: new Date(),
    projects: [],
    byPerson: [],
    byTicket: [],
    entries,
    totalsByCurrency: [],
    totalHours: 0,
    totalAgentHours: 0,
  };
}

describe("reportToCsv", () => {
  it("escapes quotes, commas and newlines so a note can't break the columns", () => {
    const csv = reportToCsv(
      reportWith([
        {
          id: "1",
          date: "2026-08-01",
          projectKey: "ACME",
          projectName: "Acme, Inc.",
          ticketKey: "ACME-1",
          ticketTitle: 'The "big" fix',
          source: "HUMAN",
          personName: "Ann",
          hours: 1.5,
          amount: 120,
          currency: "USD",
          description: "line one\nline two",
        },
      ]),
    );

    const [header, row] = csv.split("\r\n");
    expect(header).toContain('"Date"');
    expect(row).toContain('"Acme, Inc."');
    expect(row).toContain('"The ""big"" fix"');
    expect(row).toContain('"line one\nline two"');
    // Exactly ten columns, so the embedded comma didn't add one.
    expect(row!.match(/","/g)?.length).toBe(9);
  });

  it("writes an empty cell for a missing amount rather than the word null", () => {
    const csv = reportToCsv(
      reportWith([
        {
          id: "1",
          date: "2026-08-01",
          projectKey: "FIX",
          projectName: "Fixed price",
          ticketKey: "FIX-1",
          ticketTitle: "Work",
          source: "HUMAN",
          personName: "Ann",
          hours: 2,
          amount: null,
          currency: "USD",
          description: null,
        },
      ]),
    );
    const row = csv.split("\r\n")[1]!;
    expect(row).toContain('"2","","USD",""');
    expect(row).not.toContain("null");
  });
});

describe("agent hours in the CSV", () => {
  const entry = (source: string) => ({
    id: "1",
    date: "2026-08-04",
    projectKey: "ACME",
    projectName: "Acme online store",
    ticketKey: "ACME-4",
    ticketTitle: "Delivery address",
    source,
    personName: "Arthur Levine",
    hours: 1.5,
    amount: 127.5,
    currency: "USD",
    description: null,
  });

  it("leaves the column out unless the studio asked for it", () => {
    const csv = reportToCsv(reportWith([entry("AGENT")]));

    expect(csv).not.toContain("Done by");
    expect(csv).not.toContain("agent");
  });

  it("adds a plain-language column when it is switched on", () => {
    const csv = reportToCsv(reportWith([entry("AGENT"), entry("HUMAN")]), {
      showAgentHours: true,
    });

    expect(csv.split("\r\n")[0]).toContain('"Done by"');
    expect(csv).toContain('"agent"');
    expect(csv).toContain('"person"');
  });
});
