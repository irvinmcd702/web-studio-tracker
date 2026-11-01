import { Check } from "lucide-react";

import { CopyLink } from "@/components/ui/copy-link";

/**
 * What happened to a one-time link.
 *
 * When it was emailed the link is not shown at all — putting it back on the
 * screen would leave a live password link in the manager's browser history for
 * no reason. When it wasn't, the reason is stated and the link is there to be
 * passed on by hand.
 */
export function TokenDelivery({
  emailed,
  link,
  expiresAt,
  note,
}: {
  emailed?: boolean;
  link?: string;
  expiresAt?: string;
  note?: string;
}) {
  if (emailed) {
    return (
      <p className="flex items-start gap-2 rounded-[var(--radius-field)] border border-[var(--color-ok-line)] bg-[var(--color-ok-soft)] px-3 py-2.5 text-[13px] text-[var(--color-ok)]">
        <Check size={15} className="mt-0.5 shrink-0" />
        <span>{note ?? "Emailed."}</span>
      </p>
    );
  }

  if (!link) return null;

  return <CopyLink link={link} expiresAt={expiresAt} hint={note} />;
}
