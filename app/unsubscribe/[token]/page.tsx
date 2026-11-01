import Link from "next/link";

import { prisma } from "@/lib/db";
import { emailKey } from "@/lib/leads";
import { readUnsubscribeToken } from "@/lib/outreach-tokens";
import { AuthFrame } from "@/components/shell/auth-frame";
import { buttonClass } from "@/components/ui/button";

/**
 * The page a recipient lands on from the link in the footer.
 *
 * **Opening it does not unsubscribe anybody.** Corporate mail gateways
 * prefetch every URL in a message before a human ever sees it, so the act
 * needs a button: the GET shows what is about to happen, and the POST does it.
 *
 * It also answers the question the recipient actually has, which is not "am I
 * unsubscribed" but "how did you get my address" — so the provenance the
 * importer had to type is printed here, in their words.
 */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Unsubscribe — Studio Tracker",
};

export default async function UnsubscribePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const leadId = readUnsubscribeToken(token);

  const lead = leadId
    ? await prisma.lead.findUnique({ where: { id: leadId } })
    : null;

  const alreadyOff = lead
    ? Boolean(
        await prisma.suppression.findUnique({
          where: { emailKey: emailKey(lead.email) },
        }),
      )
    : false;

  // An unverifiable link is not a dead end. Rotating the server's secret
  // invalidates links already sitting in inboxes, and the person holding one
  // still asked to be left alone.
  if (!lead) {
    return (
      <AuthFrame
        title="This link could not be checked"
        description="Links stop working if the server's keys are changed. Enter your address instead and we will take it off the list."
      >
        <Link href="/unsubscribe" className={buttonClass("primary", "md")}>
          Enter my address
        </Link>
      </AuthFrame>
    );
  }

  if (alreadyOff) {
    return (
      <AuthFrame
        title="You are already unsubscribed"
        description={`Nothing further will be sent to ${lead.email}.`}
      >
        <p className="text-[13.5px] leading-relaxed text-[var(--color-muted)]">
          This address is on our suppression list. It stays there even if the
          rest of the record is deleted, so a later list cannot put it back.
        </p>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame
      title="Stop these emails"
      description={`This will take ${lead.email} off the list. Nothing further will be sent.`}
    >
      <form method="post" action="/api/outreach/unsubscribe">
        <input type="hidden" name="token" value={token} />

        {lead.sourceDetail ? (
          <div className="mb-5 rounded-[var(--radius-field)] bg-[var(--color-surface-3)] px-3.5 py-3">
            <p className="text-[12px] font-medium text-[var(--color-muted)]">
              Where we got your address
            </p>
            <p className="mt-1 text-[13.5px] leading-relaxed">
              {lead.sourceDetail}
            </p>
          </div>
        ) : null}

        <button type="submit" className={buttonClass("primary", "md")}>
          Unsubscribe
        </button>

        <p className="mt-4 text-[12.5px] leading-relaxed text-[var(--color-muted)]">
          The address stays on our suppression list afterwards. That is how we
          make sure a future list cannot add you back.
        </p>
      </form>
    </AuthFrame>
  );
}
