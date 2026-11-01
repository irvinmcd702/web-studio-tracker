import type { Prisma } from "@prisma/client";

import { prisma } from "./db";
import { emailKey, looksLikeEmail, suppressedKeys } from "./leads";
import { recordTimeline } from "./timeline";

/**
 * Turning a pasted list into leads.
 *
 * Split in two on purpose: `parseLeadCsv` is pure and knows nothing about the
 * database, and `importLeads` writes. That is what makes the awkward half —
 * quoted commas, CRLF, a byte-order mark, a column somebody called "E-Mail" —
 * testable without a fixture, and it is what lets the preview screen run the
 * exact same parse it is about to commit.
 *
 * Nothing here sends anything, and nothing here decides whether a list is
 * lawful to mail. It records what the studio was told about where the rows
 * came from, so that judgement has facts under it.
 */

export type LeadRow = {
  email: string;
  name: string | null;
  companyName: string | null;
  title: string | null;
  website: string | null;
  phone: string | null;
  country: string | null;
};

export type ParseProblem = {
  /** 1-based, counting the header, so it matches what a spreadsheet shows. */
  line: number;
  reason: string;
  value?: string;
};

export type ParsedLeads = {
  rows: LeadRow[];
  problems: ParseProblem[];
  /** The header names that were read, in the order they appeared. */
  headers: string[];
};

/**
 * What a column may be called. Everything is compared lowercased with spaces,
 * underscores and hyphens removed, so "Company Name", "company_name" and
 * "companyname" are one column.
 */
const ALIASES: Record<keyof LeadRow, string[]> = {
  email: ["email", "emailaddress", "mail", "workemail"],
  name: ["name", "fullname", "contact", "contactname", "person"],
  companyName: [
    "company",
    "companyname",
    "organisation",
    "organization",
    "org",
    "account",
  ],
  title: ["title", "jobtitle", "position", "role"],
  website: ["website", "url", "site", "domain", "web"],
  phone: ["phone", "telephone", "tel", "mobile", "phonenumber"],
  country: ["country", "countrycode", "location"],
};

function normaliseHeader(value: string) {
  return value.trim().toLowerCase().replace(/[\s_-]/g, "");
}

/**
 * RFC 4180 as far as it matters here: quoted fields, doubled quotes inside
 * them, separators and newlines inside quotes, and both line endings.
 *
 * Semicolons and tabs count as separators too, because a European Excel export
 * uses semicolons and the person pasting it has no idea that is unusual.
 */
export function splitCsv(text: string): string[][] {
  // A byte-order mark left by Excel would otherwise become part of the first
  // header, and "\uFEFFemail" matches nothing.
  const input = text.replace(/^\uFEFF/, "");

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < input.length) {
    const c = input[i]!;

    if (quoted) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }

    if (c === '"' && field === "") {
      quoted = true;
      i += 1;
      continue;
    }
    if (c === "," || c === ";" || c === "\t") {
      endField();
      i += 1;
      continue;
    }
    if (c === "\r") {
      // Swallow the \n of a CRLF; a lone \r is a line ending too.
      if (input[i + 1] === "\n") i += 1;
      endRow();
      i += 1;
      continue;
    }
    if (c === "\n") {
      endRow();
      i += 1;
      continue;
    }

    field += c;
    i += 1;
  }

  // A file that does not end in a newline still has a last row.
  if (field !== "" || row.length > 0) endRow();

  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

export function parseLeadCsv(text: string): ParsedLeads {
  const table = splitCsv(text);
  if (table.length === 0) {
    return {
      rows: [],
      headers: [],
      problems: [{ line: 1, reason: "There is nothing here" }],
    };
  }

  const headers = table[0]!.map((h) => h.trim());
  const normalised = headers.map(normaliseHeader);

  const columnFor = (field: keyof LeadRow) => {
    const names = ALIASES[field];
    const at = normalised.findIndex((h) => names.includes(h));
    return at === -1 ? null : at;
  };

  const emailAt = columnFor("email");
  if (emailAt === null) {
    return {
      rows: [],
      headers,
      problems: [
        {
          line: 1,
          // Naming what was found beats "invalid file": the usual cause is a
          // list whose first row is data rather than headers.
          reason:
            "No column that looks like an email address. Found: " +
            (headers.join(", ") || "nothing"),
        },
      ],
    };
  }

  const at = {
    name: columnFor("name"),
    companyName: columnFor("companyName"),
    title: columnFor("title"),
    website: columnFor("website"),
    phone: columnFor("phone"),
    country: columnFor("country"),
  };

  const cell = (row: string[], index: number | null) => {
    if (index === null) return null;
    const value = (row[index] ?? "").trim();
    return value === "" ? null : value.slice(0, 160);
  };

  const rows: LeadRow[] = [];
  const problems: ParseProblem[] = [];
  const seen = new Set<string>();

  for (let r = 1; r < table.length; r += 1) {
    const line = r + 1;
    const raw = table[r]!;
    const email = (raw[emailAt] ?? "").trim();

    if (email === "") {
      problems.push({ line, reason: "No email address in this row" });
      continue;
    }
    if (!looksLikeEmail(email)) {
      problems.push({ line, reason: "Not an email address", value: email });
      continue;
    }

    // Repeats within one file are reported rather than silently collapsed, so
    // the count on screen matches the number of lines the file had.
    const key = emailKey(email);
    if (seen.has(key)) {
      problems.push({
        line,
        reason: "The same address appears earlier in this file",
        value: email,
      });
      continue;
    }
    seen.add(key);

    rows.push({
      email,
      name: cell(raw, at.name),
      companyName: cell(raw, at.companyName),
      title: cell(raw, at.title),
      website: cell(raw, at.website),
      phone: cell(raw, at.phone),
      country: cell(raw, at.country),
    });
  }

  return { rows, problems, headers };
}

export type ImportOutcome = {
  rows: number;
  imported: number;
  skippedDuplicate: number;
  skippedSuppressed: number;
  skippedInvalid: number;
};

export type ImportContext = {
  fileName: string;
  /** Required. Where this list came from, in the importer's own words. */
  sourceDetail: string;
  consentNote?: string | null;
  ownerId?: string | null;
  createdById?: string | null;
};

async function classify(rows: LeadRow[]) {
  const keys = rows.map((r) => emailKey(r.email));
  const [blocked, existing] = await Promise.all([
    suppressedKeys(keys),
    prisma.lead.findMany({
      where: { emailKey: { in: keys } },
      select: { emailKey: true },
    }),
  ]);
  return { keys, blocked, known: new Set(existing.map((e) => e.emailKey)) };
}

/**
 * What committing this file would do, without doing it.
 *
 * The same counting as `importLeads`, against the same two tables, so the
 * screen before the button and the result after it cannot disagree.
 */
export async function previewLeadImport(
  parsed: ParsedLeads,
): Promise<ImportOutcome> {
  const { keys, blocked, known } = await classify(parsed.rows);

  let skippedSuppressed = 0;
  let skippedDuplicate = 0;
  for (const key of keys) {
    if (blocked.has(key)) skippedSuppressed += 1;
    else if (known.has(key)) skippedDuplicate += 1;
  }

  return {
    rows: parsed.rows.length + parsed.problems.length,
    imported: keys.length - skippedSuppressed - skippedDuplicate,
    skippedDuplicate,
    skippedSuppressed,
    skippedInvalid: parsed.problems.length,
  };
}

export async function importLeads(
  parsed: ParsedLeads,
  context: ImportContext,
): Promise<ImportOutcome & { importId: string }> {
  const { blocked, known } = await classify(parsed.rows);

  const outcome: ImportOutcome = {
    rows: parsed.rows.length + parsed.problems.length,
    imported: 0,
    skippedDuplicate: 0,
    skippedSuppressed: 0,
    skippedInvalid: parsed.problems.length,
  };

  const record = await prisma.leadImport.create({
    data: {
      fileName: context.fileName,
      sourceDetail: context.sourceDetail,
      consentNote: context.consentNote ?? null,
      createdById: context.createdById ?? null,
    },
  });

  const fresh: Prisma.LeadUncheckedCreateInput[] = [];
  for (const row of parsed.rows) {
    const key = emailKey(row.email);

    // Suppression wins over everything, including a list the studio has just
    // been handed: somebody on it has already said no.
    if (blocked.has(key)) {
      outcome.skippedSuppressed += 1;
      continue;
    }
    if (known.has(key)) {
      outcome.skippedDuplicate += 1;
      continue;
    }

    fresh.push({
      email: row.email.trim(),
      emailKey: key,
      name: row.name,
      companyName: row.companyName,
      title: row.title,
      website: row.website,
      phone: row.phone,
      country: row.country,
      sourceKind: "CSV_IMPORT",
      sourceDetail: context.sourceDetail,
      consentNote: context.consentNote ?? null,
      importId: record.id,
      ownerId: context.ownerId ?? null,
    });
  }

  if (fresh.length > 0) {
    // skipDuplicates covers the race with another import running at the same
    // moment. The count below is what actually landed, not what was offered.
    const written = await prisma.lead.createMany({
      data: fresh,
      skipDuplicates: true,
    });
    outcome.imported = written.count;
    outcome.skippedDuplicate += fresh.length - written.count;
  }

  await prisma.leadImport.update({
    where: { id: record.id },
    data: {
      rows: outcome.rows,
      imported: outcome.imported,
      skippedDuplicate: outcome.skippedDuplicate,
      skippedSuppressed: outcome.skippedSuppressed,
      skippedInvalid: outcome.skippedInvalid,
    },
  });

  // The first line of an imported lead's diary is where they came from — the
  // same sentence the first message to them will have to carry.
  const landed = await prisma.lead.findMany({
    where: { importId: record.id },
    select: { id: true },
  });
  for (const lead of landed) {
    await recordTimeline({
      kind: "IMPORT",
      summary: "Imported from " + context.fileName,
      body: context.sourceDetail,
      userId: context.createdById ?? null,
      leadId: lead.id,
    });
  }

  return { ...outcome, importId: record.id };
}
