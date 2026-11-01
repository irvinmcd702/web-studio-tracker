"use client";

import { useActionState, useRef, useState } from "react";
import { Paperclip } from "lucide-react";

import { createMeetingAction } from "@/app/actions/meetings";
import { FormError, SubmitButton } from "@/components/ui/form";

/**
 * Filing a meeting.
 *
 * A file or pasted text, not both — whichever somebody has to hand. Zoom,
 * Meet and Teams all write a caption file; a person who took their own notes
 * has a paragraph. Both are transcripts as far as this is concerned.
 */
export function MeetingForm({ projectId }: { projectId: string }) {
  const [state, action] = useActionState(createMeetingAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  // Defaults to today, because a meeting is almost always filed the day it
  // happened — and the date is the meeting's, not the upload's.
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form ref={formRef} action={action} className="space-y-3">
      <input type="hidden" name="projectId" value={projectId} />
      <FormError message={state?.error} />

      <div>
        <label className="label" htmlFor="meeting-title">
          Title <span className="text-[var(--color-danger)]">*</span>
        </label>
        <input
          id="meeting-title"
          name="title"
          required
          maxLength={160}
          placeholder="Weekly with the client"
          className="field"
        />
      </div>

      <div>
        <label className="label" htmlFor="meeting-date">
          Held on
        </label>
        <input
          id="meeting-date"
          name="heldAt"
          type="date"
          defaultValue={today}
          className="field"
        />
      </div>

      <div>
        <label className="label" htmlFor="meeting-file">
          Transcript file
        </label>
        <label
          htmlFor="meeting-file"
          className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-[var(--color-line)] px-3 py-2.5 text-[13px] text-[var(--color-muted)] hover:border-[var(--color-brand)]"
        >
          <Paperclip size={14} />
          {fileName ?? "Choose a .vtt, .srt or .txt file"}
        </label>
        <input
          id="meeting-file"
          name="file"
          type="file"
          accept=".vtt,.srt,.txt,.md,text/plain"
          className="sr-only"
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
        />
      </div>

      <div>
        <label className="label" htmlFor="meeting-text">
          …or paste it
        </label>
        <textarea
          id="meeting-text"
          name="transcript"
          rows={5}
          placeholder="Maria: let's start with the catalogue…"
          className="field resize-none"
        />
      </div>

      <SubmitButton size="sm" pendingText="Filing…">
        Add meeting
      </SubmitButton>
    </form>
  );
}
