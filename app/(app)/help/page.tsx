import Link from "next/link";
import { headers } from "next/headers";
import { Languages } from "lucide-react";

import { requireStaff } from "@/lib/auth";
import { canConfigure } from "@/lib/permissions";
import { HELP, preferredLang, type HelpLang } from "@/lib/help-content";
import { ProseLine } from "@/components/ui/prose-line";
import { Card, CardHeader, PageHeader } from "@/components/ui/primitives";

/**
 * How to use this thing, for the people who use it.
 *
 * Every other document in this repository is written for somebody building or
 * deploying the software. This one is for a developer picking up a ticket on a
 * Tuesday, and it lives in the app because that is where they are — a private
 * repository is not somewhere the studio's designer is going to read anything.
 *
 * It explains the rules that look like obstruction, because most of them are
 * the studio's own decisions rather than the tool being difficult, and a person
 * who knows which is which stops fighting the tool.
 *
 * Two languages. The project's own language is English and stays that way; the
 * guide is the one surface read by people who did not choose it, so it opens in
 * whichever of the two the browser asks for first and can be switched by hand.
 * Both versions live in one file so that changing one shows the other.
 */
export const dynamic = "force-dynamic";

export default async function HelpPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const user = await requireStaff();
  const isManager = canConfigure(user);

  const { lang } = await searchParams;
  const chosen: HelpLang | null =
    lang === "ru" ? "ru" : lang === "en" ? "en" : null;
  const language =
    chosen ?? preferredLang((await headers()).get("accept-language"));

  const content = HELP[language];
  const other = language === "en" ? "ru" : "en";

  return (
    <>
      <PageHeader
        title={content.title}
        description={content.description}
        action={
          <Link
            href={`/help?lang=${other}`}
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-field)] border border-[var(--color-line)] px-3 py-1.5 text-[13px] font-medium transition hover:bg-[var(--color-hover)]"
          >
            <Languages size={15} />
            {content.otherLanguage}
          </Link>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[220px_1fr]">
        <nav className="h-fit xl:sticky xl:top-6">
          <Card className="px-2 py-2">
            <ul className="space-y-0.5">
              {content.sections.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="block rounded-md px-3 py-1.5 text-[13px] text-[var(--color-ink-2)] transition hover:bg-[var(--color-hover)] hover:text-[var(--color-ink)]"
                  >
                    {section.title}
                  </a>
                </li>
              ))}
            </ul>
          </Card>
        </nav>

        <div className="max-w-3xl space-y-6">
          {content.sections.map((section) => (
            <Card key={section.id} id={section.id} className="scroll-mt-6">
              <CardHeader title={section.title} />
              <div className="space-y-3 px-5 py-4 text-[13.5px] leading-relaxed">
                {section.paragraphs.map((text, i) => (
                  <ProseLine key={i} text={text} />
                ))}

                {isManager
                  ? section.managerParagraphs?.map((text, i) => (
                      <ProseLine key={`m${i}`} text={text} />
                    ))
                  : section.insteadForMembers && (
                      <p className="text-[var(--color-muted)]">
                        {section.insteadForMembers}
                      </p>
                    )}
              </div>
            </Card>
          ))}

          <Card>
            <CardHeader title={content.outro.title} />
            <div className="space-y-3 px-5 py-4 text-[13.5px] leading-relaxed">
              {content.outro.paragraphs.map((text, i) => (
                <ProseLine
                  key={i}
                  text={text}
                  className={i > 0 ? "text-[var(--color-muted)]" : undefined}
                />
              ))}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
