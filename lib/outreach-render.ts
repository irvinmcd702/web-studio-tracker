/**
 * Turning a saved template into the message that actually goes out.
 *
 * Pure, and mechanical on purpose. This is the only transformation applied
 * between what a person wrote and what a stranger receives: token substitution
 * and a footer. Nothing is generated here, and nothing may be — see the header
 * of `lib/outreach-send.ts`.
 *
 * The footer is appended by this file rather than left to whoever writes the
 * template, so there is no version of a campaign that can be saved without an
 * unsubscribe link, a postal address, and a sentence saying where the
 * recipient's address came from. Two of those are legal obligations and the
 * third is the one that actually stops the mail; none of them should depend on
 * somebody remembering.
 */

export type RenderLead = {
  name: string | null;
  companyName: string | null;
  /** What the importer typed. Becomes the Article 14 sentence in the footer. */
  sourceDetail: string | null;
};

export type RenderStudio = {
  signature: string | null;
  postalAddress: string | null;
  unsubscribeUrl: string;
};

export type Rendered = {
  subject: string;
  text: string;
  /** Tokens the template used that this renderer does not know. */
  unknown: string[];
  /** What is missing before this may be sent at all. */
  missing: string[];
};

const TOKEN = /\{\{\s*([a-zA-Z]+)\s*\}\}/g;

/**
 * The greeting is one token rather than "Hello {{name}}," in the template.
 *
 * A nameless lead is the common case in an imported list, and "Hello ," is the
 * single most obvious sign of a mail merge nobody checked. Making it a token
 * the renderer owns means no template can produce that line.
 */
function greeting(lead: RenderLead) {
  return lead.name ? `Hello ${lead.name},` : "Hello,";
}

function values(lead: RenderLead, studio: RenderStudio): Record<string, string> {
  return {
    greeting: greeting(lead),
    name: lead.name ?? "",
    companyName: lead.companyName ?? "",
    signature: studio.signature ?? "",
  };
}

function substitute(
  template: string,
  table: Record<string, string>,
  unknown: Set<string>,
) {
  return template.replace(TOKEN, (whole, rawName: string) => {
    const name = rawName.trim();
    if (name in table) return table[name]!;
    // Reported, not blanked. A template that silently loses {{firstName}}
    // because the token is called {{name}} is a template nobody notices is
    // wrong until a hundred people have read it.
    unknown.add(name);
    return whole;
  });
}

export function renderOutreach(input: {
  subject: string;
  body: string;
  lead: RenderLead;
  studio: RenderStudio;
}): Rendered {
  const table = values(input.lead, input.studio);
  const unknown = new Set<string>();

  const subject = substitute(input.subject, table, unknown).trim();
  const body = substitute(input.body, table, unknown).trimEnd();

  const missing: string[] = [];
  if (!input.studio.postalAddress?.trim()) {
    missing.push("a postal address for the studio");
  }
  if (!input.studio.unsubscribeUrl) missing.push("an unsubscribe link");
  if (!subject) missing.push("a subject");
  if (!body.trim()) missing.push("a body");

  const footer = [
    "",
    "—",
    // Article 14: they did not give the studio their data, so the message has
    // to say where it came from. Built from what the importer typed.
    input.lead.sourceDetail
      ? `You are receiving this because your address was in: ${input.lead.sourceDetail}.`
      : "You are receiving this because your address was on a list the studio holds.",
    `To stop these emails: ${input.studio.unsubscribeUrl}`,
    input.studio.postalAddress?.trim() ?? "",
  ]
    .filter((line, i) => line !== "" || i < 2)
    .join("\n");

  return {
    subject,
    text: `${body}\n${footer}\n`,
    unknown: [...unknown],
    missing,
  };
}

/**
 * The tokens a template may use, for the hint under the editor. Kept beside
 * the table above so the two cannot drift apart.
 */
export const KNOWN_TOKENS = [
  "greeting",
  "name",
  "companyName",
  "signature",
] as const;
