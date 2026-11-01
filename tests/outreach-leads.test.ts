import { beforeEach, describe, expect, it } from "vitest";

import { emailKey, looksLikeEmail, suppress, suppressedKeys } from "../lib/leads";
import {
  importLeads,
  parseLeadCsv,
  previewLeadImport,
  splitCsv,
} from "../lib/lead-import";
import { runRetentionSweep, type RetentionRules } from "../lib/retention";
import { db, makeUser, resetDb } from "./setup/db";

const CONTEXT = {
  fileName: "websummit.csv",
  sourceDetail: "Attendee list, WebSummit Oct 2026",
};

describe("reading a pasted list", () => {
  it("keeps a comma that is inside quotes", () => {
    const rows = splitCsv('email,company\nada@example.com,"Lovelace, Babbage & Co"');
    expect(rows[1]).toEqual(["ada@example.com", "Lovelace, Babbage & Co"]);
  });

  it("understands a doubled quote as one quote", () => {
    const rows = splitCsv('email,company\na@b.com,"The ""Big"" Agency"');
    expect(rows[1]![1]).toBe('The "Big" Agency');
  });

  it("reads CRLF, LF and a file with no trailing newline alike", () => {
    const body = "email\r\na@b.com\r\nc@d.com";
    expect(splitCsv(body).length).toBe(3);
    expect(splitCsv(body.replace(/\r\n/g, "\n")).length).toBe(3);
  });

  it("survives the byte-order mark Excel leaves behind", () => {
    const parsed = parseLeadCsv("﻿email,name\nada@example.com,Ada");
    expect(parsed.problems).toEqual([]);
    expect(parsed.rows[0]!.email).toBe("ada@example.com");
  });

  it("takes semicolons and tabs as separators too", () => {
    expect(parseLeadCsv("email;name\na@b.com;Ada").rows[0]!.name).toBe("Ada");
    expect(parseLeadCsv("email\tname\na@b.com\tAda").rows[0]!.name).toBe("Ada");
  });

  it("finds the email column whatever it was called", () => {
    for (const header of ["email", "E-Mail", "Email Address", "  mail  "]) {
      const parsed = parseLeadCsv(`${header}\nada@example.com`);
      expect(parsed.rows, header).toHaveLength(1);
    }
  });

  it("names the columns it did find when there is no email one", () => {
    const parsed = parseLeadCsv("first,last\nAda,Lovelace");
    expect(parsed.rows).toEqual([]);
    expect(parsed.problems[0]!.reason).toContain("first, last");
  });

  it("reports a bad address by line number rather than dropping it", () => {
    const parsed = parseLeadCsv("email\nada@example.com\nnot-an-address\n");
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.problems).toEqual([
      { line: 3, reason: "Not an email address", value: "not-an-address" },
    ]);
  });

  it("reports a repeat inside one file instead of silently collapsing it", () => {
    const parsed = parseLeadCsv("email\nAda@Example.com\nada@example.com");
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.problems[0]!.line).toBe(3);
  });
});

describe("what counts as the same address", () => {
  it("trims and lowercases, and stops there", () => {
    expect(emailKey("  Ada@Example.COM ")).toBe("ada@example.com");
  });

  it("deliberately does NOT treat gmail dots or +tags as the same person", () => {
    // Guessing that two addresses are one person is inventing a fact, and it
    // fails in the direction of writing to somebody who unsubscribed.
    expect(emailKey("a.da@gmail.com")).not.toBe(emailKey("ada@gmail.com"));
    expect(emailKey("ada+news@gmail.com")).not.toBe(emailKey("ada@gmail.com"));
  });

  it("rejects what is plainly not an address and accepts what is", () => {
    expect(looksLikeEmail("ada@example.com")).toBe(true);
    expect(looksLikeEmail("ada@sub.example.co.uk")).toBe(true);
    expect(looksLikeEmail("ada@example")).toBe(false);
    expect(looksLikeEmail("not-an-address")).toBe(false);
    expect(looksLikeEmail("a@b.c, d@e.f")).toBe(false);
  });
});

describe("importing", () => {
  beforeEach(resetDb);

  it("stamps the provenance on every row", async () => {
    const parsed = parseLeadCsv("email,name\nada@example.com,Ada");
    await importLeads(parsed, CONTEXT);

    const lead = await db.lead.findUniqueOrThrow({
      where: { emailKey: "ada@example.com" },
    });
    expect(lead.sourceKind).toBe("CSV_IMPORT");
    expect(lead.sourceDetail).toBe(CONTEXT.sourceDetail);
    expect(lead.importId).not.toBeNull();
  });

  it("gives every imported lead a first diary line saying where they came from", async () => {
    const user = await makeUser({ role: "ADMIN" });
    await importLeads(parseLeadCsv("email\nada@example.com"), {
      ...CONTEXT,
      createdById: user.id,
    });

    const lead = await db.lead.findUniqueOrThrow({
      where: { emailKey: "ada@example.com" },
    });
    const entries = await db.timelineEntry.findMany({
      where: { leadId: lead.id },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.kind).toBe("IMPORT");
    expect(entries[0]!.body).toBe(CONTEXT.sourceDetail);
  });

  it("skips an address already on the suppression list, and counts it", async () => {
    await suppress({ email: "ada@example.com", reason: "UNSUBSCRIBE" });

    const outcome = await importLeads(
      parseLeadCsv("email\nada@example.com\nbob@example.com"),
      CONTEXT,
    );

    expect(outcome.skippedSuppressed).toBe(1);
    expect(outcome.imported).toBe(1);
    expect(await db.lead.count({ where: { emailKey: "ada@example.com" } })).toBe(0);
  });

  it("leaves an existing lead exactly as it was", async () => {
    await importLeads(parseLeadCsv("email,name\nada@example.com,Ada"), CONTEXT);
    const outcome = await importLeads(
      parseLeadCsv("email,name\nada@example.com,Somebody Else"),
      { ...CONTEXT, fileName: "second.csv", sourceDetail: "A different list" },
    );

    expect(outcome.skippedDuplicate).toBe(1);
    expect(outcome.imported).toBe(0);

    const lead = await db.lead.findUniqueOrThrow({
      where: { emailKey: "ada@example.com" },
    });
    expect(lead.name).toBe("Ada");
    expect(lead.sourceDetail).toBe(CONTEXT.sourceDetail);
  });

  it("records what happened to the file, not just what worked", async () => {
    await suppress({ email: "gone@example.com", reason: "COMPLAINT" });
    await importLeads(parseLeadCsv("email\nada@example.com"), CONTEXT);

    const { importId } = await importLeads(
      parseLeadCsv(
        "email\nada@example.com\ngone@example.com\nnew@example.com\nrubbish",
      ),
      CONTEXT,
    );

    const record = await db.leadImport.findUniqueOrThrow({
      where: { id: importId },
    });
    expect(record).toMatchObject({
      rows: 4,
      imported: 1,
      skippedDuplicate: 1,
      skippedSuppressed: 1,
      skippedInvalid: 1,
      sourceDetail: CONTEXT.sourceDetail,
    });
  });

  it("previews without writing anything at all", async () => {
    const parsed = parseLeadCsv("email\nada@example.com\nbob@example.com");
    const preview = await previewLeadImport(parsed);

    expect(preview.imported).toBe(2);
    expect(await db.lead.count()).toBe(0);
    expect(await db.leadImport.count()).toBe(0);
  });

  it("previews the same numbers the import then produces", async () => {
    await suppress({ email: "gone@example.com", reason: "UNSUBSCRIBE" });
    const parsed = parseLeadCsv(
      "email\nada@example.com\ngone@example.com\nrubbish",
    );

    const preview = await previewLeadImport(parsed);
    const actual = await importLeads(parsed, CONTEXT);

    expect(preview).toEqual({
      rows: actual.rows,
      imported: actual.imported,
      skippedDuplicate: actual.skippedDuplicate,
      skippedSuppressed: actual.skippedSuppressed,
      skippedInvalid: actual.skippedInvalid,
    });
  });
});

describe("the suppression list", () => {
  beforeEach(resetDb);

  it("is idempotent, and keeps the first reason", async () => {
    await suppress({ email: "ada@example.com", reason: "UNSUBSCRIBE" });
    await suppress({ email: "Ada@Example.com", reason: "MANUAL" });

    const rows = await db.suppression.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.reason).toBe("UNSUBSCRIBE");
  });

  it("marks the lead behind the address when there is one", async () => {
    await importLeads(parseLeadCsv("email\nada@example.com"), CONTEXT);
    await suppress({ email: "ada@example.com", reason: "UNSUBSCRIBE" });

    const lead = await db.lead.findUniqueOrThrow({
      where: { emailKey: "ada@example.com" },
    });
    expect(lead.status).toBe("UNSUBSCRIBED");
  });

  it("works for an address no lead has ever had", async () => {
    await suppress({ email: "nobody@example.com", reason: "MANUAL" });
    expect(await suppressedKeys(["nobody@example.com"])).toEqual(
      new Set(["nobody@example.com"]),
    );
  });

  it("outlives the lead it came from", async () => {
    await importLeads(parseLeadCsv("email\nada@example.com"), CONTEXT);
    await suppress({ email: "ada@example.com", reason: "UNSUBSCRIBE" });

    const lead = await db.lead.findUniqueOrThrow({
      where: { emailKey: "ada@example.com" },
    });
    await db.lead.delete({ where: { id: lead.id } });

    // The whole point of having no foreign key: erasing the lead must not
    // re-open the door.
    expect(await db.suppression.count()).toBe(1);

    const again = await importLeads(
      parseLeadCsv("email\nada@example.com"),
      CONTEXT,
    );
    expect(again.imported).toBe(0);
    expect(again.skippedSuppressed).toBe(1);
  });
});

describe("retention never touches the suppression list", () => {
  beforeEach(resetDb);

  it("leaves every row where it is, with every period set to one day", async () => {
    await suppress({ email: "ada@example.com", reason: "UNSUBSCRIBE" });
    await db.suppression.update({
      where: { emailKey: "ada@example.com" },
      // Older than any period anyone could configure.
      data: { createdAt: new Date(Date.now() - 3650 * 86_400_000) },
    });

    const everything: RetentionRules = {
      retainActivityDays: 1,
      retainChatDays: 1,
      retainAiUsageDays: 1,
      retainMeetingDays: 1,
      retainOutreachDays: 1,
    };
    await runRetentionSweep({ rules: everything });

    expect(await db.suppression.count()).toBe(1);
  });
});
