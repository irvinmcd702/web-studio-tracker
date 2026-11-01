"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";

import { Markdown } from "@/components/docs/markdown";
import { DocEditor, type DocValues } from "@/components/docs/doc-editor";
import { Button } from "@/components/ui/button";

/** Reading view with an in-place switch to editing — no separate edit route. */
export function DocView({
  doc,
  projectId,
  canEdit,
  canShare,
}: {
  doc: DocValues & { id: string; title: string; body: string };
  projectId: string | null;
  canEdit: boolean;
  canShare: boolean;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <DocEditor
        values={doc}
        projectId={projectId}
        canShare={canShare}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="space-y-4">
      {canEdit ? (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setEditing(true)}
          >
            <Pencil size={14} />
            Edit
          </Button>
        </div>
      ) : null}

      <Markdown>{doc.body}</Markdown>
    </div>
  );
}
