import Link from "next/link";
import { redirect } from "next/navigation";
import { Download } from "lucide-react";

import { requireUser } from "@/lib/auth";
import { describePeriod, privacyFacts } from "@/lib/privacy-notice";
import { Card, CardHeader, PageHeader } from "@/components/ui/primitives";

/**
 * What the customer is told about their own data.
 *
 * Almost all of it is derived from the live configuration — see
 * `lib/privacy-notice.ts` for why. The page's job is to say it in sentences a
 * person without training can read, and to put the button that acts on it
 * within reach rather than behind an email to a manager.
 */
export const dynamic = "force-dynamic";

export default async function PortalPrivacyPage() {
  const user = await requireUser();
  if (user.role !== "CLIENT") redirect("/dashboard");
  if (!user.clientId) redirect("/portal");

  const facts = await privacyFacts(user.clientId);

  return (
    <>
      <PageHeader
        title="Your data"
        description="What this tracker holds about you, who else sees it, and what you can ask for"
        breadcrumb={
          <Link href="/portal" className="hover:underline">
            Portal
          </Link>
        }
      />

      <div className="max-w-3xl space-y-6">
        <Card>
          <CardHeader title="Who holds it" />
          <div className="space-y-3 px-5 py-4 text-[13.5px] leading-relaxed">
            {facts.controller.name ? (
              <p>
                <span className="font-medium">{facts.controller.name}</span>{" "}
                runs this tracker and answers for what is in it.
              </p>
            ) : (
              <p className="rounded-[var(--radius-field)] bg-[var(--color-warn-soft)] px-3 py-2 text-[var(--color-warn)]">
                The studio has not filled in its legal name here yet. Ask them
                who the data controller is before relying on this page.
              </p>
            )}
            {facts.controller.contact ? (
              <p>
                Questions, corrections and requests go to{" "}
                <a
                  href={`mailto:${facts.controller.contact}`}
                  className="font-medium text-[var(--color-brand)] hover:underline"
                >
                  {facts.controller.contact}
                </a>
                .
              </p>
            ) : (
              <p className="text-[var(--color-muted)]">
                No contact address has been set. Write to your project manager
                in the portal chat.
              </p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="What is held" />
          <div className="px-5 py-4 text-[13.5px] leading-relaxed">
            <ul className="space-y-2">
              <li>
                <span className="font-medium">Your account</span> — your name,
                your email address, and when you last changed your password. The
                password itself is stored only as a hash; nobody at the studio
                can read it.
              </li>
              <li>
                <span className="font-medium">What you write here</span> —
                messages in the project chat, and your decisions on anything you
                were asked to approve, with the date and any note you added.
              </li>
              <li>
                <span className="font-medium">What you upload</span> — the files
                themselves and their names.
              </li>
              <li>
                <span className="font-medium">
                  Your company&rsquo;s details
                </span>{" "}
                — the contact name, address and phone the studio recorded for
                you.
              </li>
            </ul>
            <p className="mt-3 text-[var(--color-muted)]">
              There is no analytics, no advertising and no third-party script on
              this site. One cookie keeps you signed in; there is nothing else
              to consent to, which is why you were never asked.
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Who else sees it"
            description="Read from how this tracker is configured right now, not from a paragraph written once"
          />
          <ul className="divide-y divide-[var(--color-line)]">
            {facts.recipients.map((recipient) => (
              <li key={recipient.name} className="px-5 py-3.5">
                <p className="text-[13.5px] font-medium">{recipient.name}</p>
                <p className="mt-0.5 text-[13px] text-[var(--color-muted)]">
                  {recipient.what}
                </p>
                <p className="mt-0.5 text-[12.5px] text-[var(--color-muted)]">
                  Why: {recipient.why}
                </p>
              </li>
            ))}
          </ul>
          <p className="border-t border-[var(--color-line)] px-5 py-3 text-[12.5px] text-[var(--color-muted)]">
            Inside the studio, only the people put on your project can open it.
          </p>
        </Card>

        <Card>
          <CardHeader title="How long" />
          <div className="space-y-2 px-5 py-4 text-[13.5px] leading-relaxed">
            <p>
              Your messages are{" "}
              <span className="font-medium">
                {describePeriod(facts.retention.chatDays)}
              </span>
              , and the record of who did what is{" "}
              <span className="font-medium">
                {describePeriod(facts.retention.activityDays)}
              </span>
              .
            </p>
            <p className="text-[var(--color-muted)]">
              The project itself — tasks, hours and invoices — is kept as the
              record of work done and paid for.
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader title="What you can ask for" />
          <div className="space-y-3 px-5 py-4 text-[13.5px] leading-relaxed">
            <p>
              <span className="font-medium">A copy of everything</span> held
              about you, right now, without asking anyone:
            </p>
            <a
              href={`/api/people/${user.id}/export`}
              className="inline-flex items-center gap-2 rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-[13px] font-medium transition hover:bg-[var(--color-hover)]"
            >
              <Download size={15} />
              Download my data
            </a>
            <p>
              <span className="font-medium">A correction</span>, if something
              here is wrong, or{" "}
              <span className="font-medium">deletion of your account</span>.
              Both go to the address above. Deleting your account removes your
              name, your email and your login; the project&rsquo;s own record —
              messages, files and the work done — stays, because it is the
              studio&rsquo;s record of a job as much as it is yours.
            </p>
          </div>
        </Card>

        {facts.extra ? (
          <Card>
            <CardHeader title="From the studio" />
            <div className="px-5 py-4 text-[13.5px] leading-relaxed whitespace-pre-wrap">
              {facts.extra}
            </div>
          </Card>
        ) : null}
      </div>
    </>
  );
}
