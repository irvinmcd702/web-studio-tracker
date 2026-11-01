import { prisma } from "./db";
import { emailKey } from "./leads";

/**
 * Everything the tracker holds about one lead, in one file.
 *
 * `lib/data-export.ts` answers the same question for a `User`, and a lead is
 * not one — they have no account, they never signed in, and in most cases they
 * never asked to be here at all. That makes this the *more* likely of the two
 * to be asked for, so it exists from the day the first lead is imported rather
 * than being retrofitted after somebody writes in.
 *
 * Same shape and same reasoning as the staff export: JSON, because a file a
 * person can only look at answers "show me what you have" and not "give me it
 * in a form I can take elsewhere".
 */

export type LeadExport = {
  exportedAt: string;
  about: {
    note: string;
    limits: string[];
  };
  lead: unknown;
  provenance: unknown;
  suppression: unknown;
  history: unknown;
};

export async function exportLead(leadId: string): Promise<LeadExport | null> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      owner: { select: { name: true } },
      import: {
        select: {
          fileName: true,
          sourceDetail: true,
          consentNote: true,
          createdAt: true,
        },
      },
    },
  });
  if (!lead) return null;

  const [suppression, timeline] = await Promise.all([
    prisma.suppression.findUnique({
      where: { emailKey: emailKey(lead.email) },
      select: { reason: true, source: true, note: true, createdAt: true },
    }),
    prisma.timelineEntry.findMany({
      where: { leadId },
      orderBy: { createdAt: "asc" },
      select: {
        kind: true,
        summary: true,
        body: true,
        actorKind: true,
        createdAt: true,
        user: { select: { name: true } },
      },
    }),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    about: {
      note:
        "Everything this tracker holds about one address, including where the " +
        "studio says it got it.",
      limits: [
        "This covers the outreach records only. If the same person is also a " +
          "client contact, that is a separate record with a separate export.",
        suppression
          ? "This address is on the suppression list and will not be mailed. " +
            "That row is kept even if the lead itself is deleted — otherwise " +
            "a later import would start writing to it again."
          : "This address is not on the suppression list.",
      ],
    },
    lead: {
      email: lead.email,
      name: lead.name,
      companyName: lead.companyName,
      title: lead.title,
      website: lead.website,
      phone: lead.phone,
      country: lead.country,
      status: lead.status,
      owner: lead.owner?.name ?? null,
      createdAt: lead.createdAt,
      updatedAt: lead.updatedAt,
      lastContactedAt: lead.lastContactedAt,
      lastRepliedAt: lead.lastRepliedAt,
    },
    provenance: {
      sourceKind: lead.sourceKind,
      sourceDetail: lead.sourceDetail,
      consentNote: lead.consentNote,
      import: lead.import,
    },
    suppression,
    history: timeline,
  };
}
