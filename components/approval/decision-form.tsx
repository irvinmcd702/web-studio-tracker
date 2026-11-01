"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, RotateCcw } from "lucide-react";

import { decideApprovalAction } from "@/app/actions/approvals";
import { Button } from "@/components/ui/button";
import { FormError, SubmitButton, Textarea } from "@/components/ui/form";

/**
 * Approve or send back with a comment. Used by the client in the portal and by
 * studio staff recording a decision that arrived some other way.
 */
export function DecisionForm({
  approvalId,
  recordingForClient = false,
}: {
  approvalId: string;
  /** Staff view — makes it explicit whose decision is being written down. */
  recordingForClient?: boolean;
}) {
  const [state, action] = useActionState(decideApprovalAction, null);
  const [mode, setMode] = useState<"idle" | "changes">("idle");
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) {
      setMode("idle");
      router.refresh();
    }
  }, [state, router]);

  return (
    <div className="space-y-2">
      <FormError message={state?.error} />

      {mode === "idle" ? (
        <div className="flex flex-wrap gap-2">
          <form action={action}>
            <input type="hidden" name="id" value={approvalId} />
            <input type="hidden" name="decision" value="APPROVED" />
            <SubmitButton size="sm" pendingText="Saving…">
              <Check size={14} />
              {recordingForClient ? "Record as approved" : "Approve"}
            </SubmitButton>
          </form>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setMode("changes")}
          >
            <RotateCcw size={14} />
            Request changes
          </Button>
        </div>
      ) : (
        <form action={action} className="space-y-2">
          <input type="hidden" name="id" value={approvalId} />
          <input type="hidden" name="decision" value="CHANGES_REQUESTED" />
          <Textarea
            name="decisionNote"
            rows={3}
            required
            placeholder="What needs to change?"
          />
          <div className="flex gap-2">
            <SubmitButton size="sm" variant="danger" pendingText="Sending…">
              Send back for changes
            </SubmitButton>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setMode("idle")}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {recordingForClient ? (
        <p className="text-[11.5px] text-[var(--color-muted)]">
          Use this only for a decision the client gave elsewhere — it is
          recorded under your name.
        </p>
      ) : null}
    </div>
  );
}
