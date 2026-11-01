import Link from "next/link";

import { Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { ImportForm } from "@/components/outreach/import-form";

export default function ImportLeadsPage() {
  return (
    <>
      <PageHeader
        title="Import a list"
        breadcrumb={
          <Link href="/outreach/leads" className="hover:underline">
            Leads
          </Link>
        }
        description="Paste a list, see exactly what it would do, then commit it"
      />

      <div className="grid max-w-5xl gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Card className="p-5">
            <ImportForm />
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="What happens to a row" />
            <ul className="space-y-2.5 px-5 py-4 text-[13px] leading-relaxed text-[var(--color-ink-2)]">
              <li>
                <span className="font-medium text-[var(--color-ink)]">
                  Suppressed
                </span>{" "}
                — the address is on the list of people who asked not to be
                written to. It is skipped, and it stays skipped no matter how
                many lists it appears in.
              </li>
              <li>
                <span className="font-medium text-[var(--color-ink)]">
                  Already known
                </span>{" "}
                — the address is already a lead. The existing record is left
                exactly as it is; an import never overwrites what somebody has
                since edited or written a note against.
              </li>
              <li>
                <span className="font-medium text-[var(--color-ink)]">
                  Unreadable
                </span>{" "}
                — no address in the row, or something that is not one. Every
                such row is listed by line number so you can fix the file
                rather than guess.
              </li>
            </ul>
          </Card>

          <Card>
            <CardHeader title="Matching addresses" />
            <div className="px-5 py-4 text-[13px] leading-relaxed text-[var(--color-ink-2)]">
              <p>
                Two addresses count as the same one only if they match after
                trimming spaces and lowercasing. Dots in gmail addresses and
                <code className="mx-1 font-mono text-[12px]">+tags</code>
                are left alone on purpose: treating them as the same person is
                a guess, and it is a guess that fails in the direction of
                writing to somebody who thought they had unsubscribed.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
