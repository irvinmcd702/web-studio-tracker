import Link from "next/link";
import { Ban } from "lucide-react";

import { prisma } from "@/lib/db";
import { suppressionReasonLabels } from "@/lib/labels";
import { formatDateTime } from "@/lib/utils";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
} from "@/components/ui/primitives";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { SuppressionForm } from "@/components/outreach/suppression-form";
import { unsuppressAddressAction } from "@/app/actions/leads";

/**
 * The addresses this tracker will not write to.
 *
 * Deliberately a page of its own rather than a filter on the lead list: most
 * of these will have a lead behind them and some will not, and the answer to
 * "are we allowed to mail this person" should not depend on whether anybody
 * ever imported them.
 */
export default async function SuppressionPage() {
  const rows = await prisma.suppression.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const leads = await prisma.lead.findMany({
    where: { emailKey: { in: rows.map((r) => r.emailKey) } },
    select: { id: true, emailKey: true, name: true },
  });
  const leadFor = new Map(leads.map((l) => [l.emailKey, l]));

  return (
    <>
      <PageHeader
        title="Suppression list"
        breadcrumb={
          <Link href="/outreach" className="hover:underline">
            Outreach
          </Link>
        }
        description="Addresses that will never be written to, whatever any list says"
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Card className="overflow-hidden">
            <CardHeader
              title="On the list"
              description={
                rows.length ? `${rows.length} addresses` : undefined
              }
            />
            {rows.length === 0 ? (
              <EmptyState
                icon={<Ban size={30} />}
                title="Nobody has asked to be left alone yet"
                description="Addresses land here from the unsubscribe link, or by being added by hand."
              />
            ) : (
              <ul className="divide-y divide-[var(--color-line)]">
                {rows.map((row) => {
                  const lead = leadFor.get(row.emailKey);
                  return (
                    <li
                      key={row.id}
                      className="flex flex-wrap items-center gap-3 px-5 py-3.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-medium">
                          {lead ? (
                            <Link
                              href={`/outreach/leads/${lead.id}`}
                              className="text-[var(--color-brand)] hover:underline"
                            >
                              {row.emailKey}
                            </Link>
                          ) : (
                            row.emailKey
                          )}
                        </p>
                        <p className="mt-0.5 truncate text-[12px] text-[var(--color-muted)]">
                          {formatDateTime(row.createdAt)}
                          {row.source ? ` · ${row.source}` : ""}
                          {row.note ? ` · ${row.note}` : ""}
                        </p>
                      </div>

                      <Badge color="#dc2626">
                        {suppressionReasonLabels[row.reason] ?? row.reason}
                      </Badge>

                      <form action={unsuppressAddressAction}>
                        <input type="hidden" name="id" value={row.id} />
                        <ConfirmSubmit
                          question="Start writing to this address again?"
                          confirmLabel="Take off the list"
                        >
                          Take off the list
                        </ConfirmSubmit>
                      </form>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-4 text-[15px] font-semibold">
              Add an address
            </h2>
            <SuppressionForm />
          </Card>

          <Card>
            <CardHeader title="Why this list outlives everything else" />
            <div className="space-y-3 px-5 py-4 text-[13px] leading-relaxed text-[var(--color-ink-2)]">
              <p>
                Nothing removes a row from here on a schedule. The retention
                sweep skips this table entirely, because deleting a suppression
                means writing to somebody who asked you not to.
              </p>
              <p>
                Deleting the lead does not remove the suppression either. If it
                did, the next list containing that address would quietly put
                them back.
              </p>
              <p>
                The address is stored as typed rather than hashed. A hash keyed
                on a rotatable secret would, the day somebody rotated it, let
                everyone here be written to again.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
