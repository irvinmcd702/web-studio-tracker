import { beforeEach, describe, expect, it } from "vitest";

import {
  cellName,
  parseCellHours,
  readCellName,
  setCellHours,
} from "../lib/timesheet";
import { dayKeyToDate } from "../lib/time";
import {
  db,
  makeProject,
  makeTicket,
  makeUser,
  makeWorkflow,
  resetDb,
} from "./setup/db";

describe("parseCellHours", () => {
  it("treats an empty cell as zero", () => {
    expect(parseCellHours("")).toBe(0);
    expect(parseCellHours("   ")).toBe(0);
  });

  it("accepts a comma as the decimal separator", () => {
    expect(parseCellHours("1,5")).toBe(1.5);
  });

  it("snaps to whole minutes", () => {
    expect(parseCellHours("1.007")).toBeCloseTo(1, 5);
    expect(parseCellHours("0.51")).toBeCloseTo(0.5167, 3);
  });

  it("rejects junk and negatives", () => {
    expect(parseCellHours("abc")).toBeNull();
    expect(parseCellHours("-2")).toBeNull();
  });
});

describe("setCellHours", () => {
  const DAY = "2026-08-05";
  let userId: string;
  let ticketId: string;

  beforeEach(async () => {
    await resetDb();
    const workflow = await makeWorkflow();
    const user = await makeUser();
    const project = await makeProject({ workflowId: workflow.id });
    const ticket = await makeTicket(project.id, workflow.statuses[0]!.id);
    userId = user.id;
    ticketId = ticket.id;
  });

  const logsForDay = () =>
    db.workLog.findMany({
      where: {
        ticketId,
        userId,
        spentOn: {
          gte: new Date(2026, 7, 5, 0, 0, 0),
          lte: new Date(2026, 7, 5, 23, 59, 59),
        },
      },
    });

  it("creates an entry for an empty day", async () => {
    expect(await setCellHours({ userId, ticketId, day: DAY, hours: 3 })).toBe(
      "created",
    );
    const logs = await logsForDay();
    expect(logs).toHaveLength(1);
    expect(logs[0]!.hours).toBe(3);
  });

  it("updates the existing entry instead of adding a second", async () => {
    await setCellHours({ userId, ticketId, day: DAY, hours: 3 });
    expect(await setCellHours({ userId, ticketId, day: DAY, hours: 4.5 })).toBe(
      "updated",
    );
    const logs = await logsForDay();
    expect(logs).toHaveLength(1);
    expect(logs[0]!.hours).toBe(4.5);
  });

  it("deletes the entry when the cell is cleared", async () => {
    await setCellHours({ userId, ticketId, day: DAY, hours: 3 });
    expect(await setCellHours({ userId, ticketId, day: DAY, hours: 0 })).toBe(
      "deleted",
    );
    expect(await logsForDay()).toHaveLength(0);
  });

  it("does nothing when the value has not moved", async () => {
    await setCellHours({ userId, ticketId, day: DAY, hours: 2 });
    expect(await setCellHours({ userId, ticketId, day: DAY, hours: 2 })).toBe(
      "unchanged",
    );
    expect(await setCellHours({ userId, ticketId, day: DAY, hours: 0 })).toBe(
      "deleted",
    );
    expect(await setCellHours({ userId, ticketId, day: DAY, hours: 0 })).toBe(
      "unchanged",
    );
  });

  it("refuses to collapse a day that holds several entries", async () => {
    await db.workLog.createMany({
      data: [
        {
          ticketId,
          userId,
          hours: 1,
          spentOn: dayKeyToDate(DAY),
          description: "first",
        },
        {
          ticketId,
          userId,
          hours: 2,
          spentOn: dayKeyToDate(DAY),
          description: "second",
        },
      ],
    });

    expect(await setCellHours({ userId, ticketId, day: DAY, hours: 9 })).toBe(
      "conflict",
    );

    // Both entries survive untouched, notes and all.
    const logs = await logsForDay();
    expect(logs).toHaveLength(2);
    expect(logs.map((l) => l.description).sort()).toEqual(["first", "second"]);
    expect(logs.reduce((s, l) => s + l.hours, 0)).toBe(3);
  });

  it("keeps other people's time out of the cell", async () => {
    const other = await makeUser();
    await db.workLog.create({
      data: {
        ticketId,
        userId: other.id,
        hours: 5,
        spentOn: dayKeyToDate(DAY),
      },
    });

    expect(await setCellHours({ userId, ticketId, day: DAY, hours: 2 })).toBe(
      "created",
    );

    const mine = await logsForDay();
    expect(mine).toHaveLength(1);
    const theirs = await db.workLog.findMany({ where: { userId: other.id } });
    expect(theirs[0]!.hours).toBe(5);
  });

  it("does not touch a neighbouring day", async () => {
    await setCellHours({ userId, ticketId, day: DAY, hours: 3 });
    await setCellHours({ userId, ticketId, day: "2026-08-06", hours: 1 });

    expect(await logsForDay()).toHaveLength(1);
    expect(await db.workLog.count({ where: { ticketId, userId } })).toBe(2);
  });
});

/**
 * The grid names its cells and the action reads those names. When those two
 * were written out separately they happened to agree — and if they ever
 * stopped, every cell would be skipped and Save would still report success.
 * Hours quietly not recorded are hours quietly not invoiced.
 */
describe("the name a timesheet cell carries", () => {
  it("reads back exactly what it wrote", () => {
    const name = cellName("ckabc123", "2026-08-06");
    expect(readCellName(name)).toEqual({
      ticketId: "ckabc123",
      day: "2026-08-06",
    });
  });

  it("ignores every other field in the form", () => {
    for (const other of ["id", "note", "week", "", "cell", "cellophane"]) {
      expect(readCellName(other)).toBeNull();
    }
  });

  it("refuses a half-formed cell name rather than guessing", () => {
    expect(readCellName("cell:")).toBeNull();
    expect(readCellName("cell:ckabc123")).toBeNull();
    expect(readCellName("cell:ckabc123:")).toBeNull();
  });
});
