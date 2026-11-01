"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";

import { addStatusAction, updateStatusAction } from "@/app/actions/workflows";
import { Modal, useModalClose } from "@/components/ui/modal";
import { buttonClass } from "@/components/ui/button";
import {
  Field,
  FormError,
  Input,
  Select,
  SubmitButton,
} from "@/components/ui/form";
import { categoryLabels } from "@/lib/labels";

const COLORS = [
  "#64748b",
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#d97706",
  "#16a34a",
  "#0891b2",
  "#dc2626",
];

function ColorPicker({ defaultValue }: { defaultValue?: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {COLORS.map((color, index) => (
        <label key={color} className="cursor-pointer">
          <input
            type="radio"
            name="color"
            value={color}
            defaultChecked={defaultValue ? defaultValue === color : index === 0}
            className="peer sr-only"
          />
          <span
            className="block h-7 w-7 rounded-full ring-[var(--color-ink)] ring-offset-2 transition peer-checked:ring-2"
            style={{ backgroundColor: color }}
          />
        </label>
      ))}
    </div>
  );
}

export function AddStatusButton({ workflowId }: { workflowId: string }) {
  return (
    <Modal
      title="New status"
      triggerClassName={buttonClass("secondary", "sm")}
      trigger={
        <span className="inline-flex items-center gap-1.5">
          <Plus size={14} />
          Add status
        </span>
      }
    >
      <StatusForm workflowId={workflowId} />
    </Modal>
  );
}

export function EditStatusButton({
  workflowId,
  status,
}: {
  workflowId: string;
  status: { id: string; name: string; category: string; color: string };
}) {
  return (
    <Modal
      title="Edit status"
      triggerClassName="rounded-md p-1.5 text-[var(--color-muted)] transition hover:bg-[var(--color-hover-strong)] hover:text-[var(--color-ink)]"
      triggerLabel={`Edit the status ${status.name}`}
      trigger={<Pencil size={14} />}
    >
      <StatusForm workflowId={workflowId} status={status} />
    </Modal>
  );
}

function StatusForm({
  workflowId,
  status,
}: {
  workflowId: string;
  status?: { id: string; name: string; category: string; color: string };
}) {
  const [state, action] = useActionState(
    status ? updateStatusAction : addStatusAction,
    null,
  );
  const close = useModalClose();
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
      close();
    }
  }, [state, close, router]);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="workflowId" value={workflowId} />
      {status ? <input type="hidden" name="id" value={status.id} /> : null}

      <FormError message={state?.error} />

      <Field label="Name" required>
        <Input
          name="name"
          defaultValue={status?.name}
          placeholder="Code review"
          required
        />
      </Field>

      <Field
        label="Category"
        hint="Decides whether a ticket counts as finished"
      >
        <Select name="category" defaultValue={status?.category ?? "TODO"}>
          {Object.entries(categoryLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>

      <div>
        <p className="label">Color</p>
        <ColorPicker defaultValue={status?.color} />
      </div>

      <div className="flex justify-end border-t border-[var(--color-line)] pt-4">
        <SubmitButton>{status ? "Save" : "Add"}</SubmitButton>
      </div>
    </form>
  );
}
