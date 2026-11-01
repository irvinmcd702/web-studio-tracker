"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";

import {
  uploadAttachmentAction,
  uploadRequestAttachmentAction,
} from "@/app/actions/files";
import { FormError, SubmitButton } from "@/components/ui/form";

export function FileUpload({
  projectId,
  ticketId,
  requestId,
  approvalId,
  showVisibilityToggle = true,
  compact = false,
}: {
  projectId?: string;
  ticketId?: string;
  requestId?: string;
  approvalId?: string;
  showVisibilityToggle?: boolean;
  compact?: boolean;
}) {
  const action = requestId
    ? uploadRequestAttachmentAction
    : uploadAttachmentAction;
  const [state, formAction] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state, router]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      {projectId ? (
        <input type="hidden" name="projectId" value={projectId} />
      ) : null}
      {ticketId ? (
        <input type="hidden" name="ticketId" value={ticketId} />
      ) : null}
      {requestId ? (
        <input type="hidden" name="requestId" value={requestId} />
      ) : null}
      {approvalId ? (
        <input type="hidden" name="approvalId" value={approvalId} />
      ) : null}

      <FormError message={state?.error} />

      <input
        type="file"
        name="files"
        multiple
        required
        aria-label="Files to upload"
        className="block w-full cursor-pointer rounded-lg border border-dashed border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 py-3 text-[13px] file:mr-3 file:rounded-md file:border-0 file:bg-[var(--color-surface)] file:px-3 file:py-1.5 file:text-[13px] file:font-medium hover:border-[var(--color-line-strong)]"
      />

      <div
        className={
          compact
            ? "flex items-center justify-between gap-3"
            : "flex flex-wrap items-center justify-between gap-3"
        }
      >
        {showVisibilityToggle ? (
          <label className="flex items-center gap-2 text-[12.5px] text-[var(--color-muted)]">
            <input
              type="checkbox"
              name="isClientVisible"
              defaultChecked
              className="accent-[var(--color-brand)]"
            />
            Visible to the client
          </label>
        ) : (
          <span />
        )}
        <SubmitButton size="sm" pendingText="Uploading…">
          <Upload size={14} />
          Upload
        </SubmitButton>
      </div>
      <p className="text-[11.5px] text-[var(--color-muted)]">
        Up to 20 MB per file. You can select several.
      </p>
    </form>
  );
}
