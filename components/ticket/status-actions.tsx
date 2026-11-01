"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { moveTicketFeedbackAction } from "@/app/actions/tickets";
import { FormError } from "@/components/ui/form";

/**
 * Transition buttons on the ticket. A move can legitimately be refused by the
 * conditions on the arrow, so the reason is shown here rather than blowing up
 * the page.
 */
export function StatusActions({
  ticketId,
  targets,
}: {
  ticketId: string;
  targets: { id: string; name: string; label: string }[];
}) {
  const [state, action] = useActionState(moveTicketFeedbackAction, null);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  if (targets.length === 0) {
    return (
      <p className="text-[12.5px] text-[var(--color-muted)]">
        No transitions are defined out of this status.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <FormError message={state?.error} />

      <div className="flex flex-wrap gap-2">
        {targets.map((target) => (
          <form key={target.id} action={action}>
            <input type="hidden" name="id" value={ticketId} />
            <input type="hidden" name="statusId" value={target.id} />
            <button
              type="submit"
              title={`Move to ${target.name}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-[12.5px] font-medium transition hover:border-[var(--color-line-strong)] hover:bg-[var(--color-hover)]"
            >
              <ArrowRight size={13} />
              {target.label}
            </button>
          </form>
        ))}
      </div>
    </div>
  );
}
