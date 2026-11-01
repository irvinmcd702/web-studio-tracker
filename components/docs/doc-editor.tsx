"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, Pencil } from "lucide-react";

import { createDocAction, updateDocAction } from "@/app/actions/docs";
import { Markdown } from "@/components/docs/markdown";
import { FormError, Input, SubmitButton } from "@/components/ui/form";
import { cn } from "@/lib/utils";

export type DocValues = {
  id?: string;
  title?: string;
  body?: string;
  isClientVisible?: boolean;
};

/**
 * Edit-or-preview rather than a split view: at this width a side-by-side
 * preview leaves both halves too narrow to read.
 */
export function DocEditor({
  values,
  projectId,
  canShare,
  onCancel,
}: {
  values?: DocValues;
  /** Set when the doc belongs to a project — enables the sharing toggle. */
  projectId?: string | null;
  canShare: boolean;
  onCancel?: () => void;
}) {
  const [state, action] = useActionState(
    values?.id ? updateDocAction : createDocAction,
    null,
  );
  const [body, setBody] = useState(values?.body ?? "");
  const [tab, setTab] = useState<"write" | "preview">("write");
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
      onCancel?.();
    }
  }, [state, router, onCancel]);

  return (
    <form action={action} className="space-y-4">
      {values?.id ? <input type="hidden" name="id" value={values.id} /> : null}
      {projectId ? (
        <input type="hidden" name="projectId" value={projectId} />
      ) : null}

      <FormError message={state?.error} />

      <Input
        name="title"
        defaultValue={values?.title}
        placeholder="Brief, spec, meeting notes…"
        required
        className="!text-[16px] font-semibold"
      />

      <div>
        <div className="mb-2 flex items-center gap-1">
          {(["write", "preview"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setTab(mode)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium transition",
                tab === mode
                  ? "bg-[var(--color-brand-soft)] text-[var(--color-brand)]"
                  : "text-[var(--color-muted)] hover:bg-[var(--color-hover-strong)]",
              )}
            >
              {mode === "write" ? <Pencil size={13} /> : <Eye size={13} />}
              {mode === "write" ? "Write" : "Preview"}
            </button>
          ))}
          <span className="ml-auto text-[11.5px] text-[var(--color-muted)]">
            Markdown — headings, lists, tables, checkboxes
          </span>
        </div>

        {tab === "write" ? (
          <textarea
            name="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            aria-label="Document body, Markdown"
            rows={20}
            placeholder={
              "# Goals\n\n- What we are building\n- What we are not building\n\n## Open questions\n\n- [ ] Hosting?"
            }
            className="field min-h-[420px] resize-y font-mono text-[13px] leading-relaxed"
          />
        ) : (
          <>
            {/* Keep the value in the form while the textarea is unmounted. */}
            <input type="hidden" name="body" value={body} />
            <div className="min-h-[420px] rounded-lg border border-[var(--color-line)] px-4 py-3">
              <Markdown>{body}</Markdown>
            </div>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-line)] pt-4">
        {canShare ? (
          <label className="flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              name="isClientVisible"
              defaultChecked={values?.isClientVisible}
              className="accent-[var(--color-brand)]"
            />
            Share with the client in the portal
          </label>
        ) : (
          <span className="text-[12px] text-[var(--color-muted)]">
            Studio-wide doc — clients never see it
          </span>
        )}

        <span className="flex items-center gap-2">
          {onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg px-3 py-2 text-[13px] font-medium text-[var(--color-muted)] transition hover:bg-[var(--color-hover-strong)]"
            >
              Cancel
            </button>
          ) : null}
          <SubmitButton>{values?.id ? "Save" : "Create doc"}</SubmitButton>
        </span>
      </div>
    </form>
  );
}
