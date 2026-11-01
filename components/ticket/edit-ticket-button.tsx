"use client";

import { Pencil } from "lucide-react";

import { updateTicketAction } from "@/app/actions/tickets";
import { Modal } from "@/components/ui/modal";
import { buttonClass } from "@/components/ui/button";
import {
  TicketForm,
  type TicketFormValues,
} from "@/components/project/ticket-form";

export function EditTicketButton({
  values,
  assignees,
}: {
  values: TicketFormValues;
  assignees: { id: string; name: string; extra?: string }[];
}) {
  return (
    <Modal
      title="Edit ticket"
      triggerClassName={buttonClass("secondary", "sm")}
      trigger={
        <span className="inline-flex items-center gap-1.5">
          <Pencil size={14} />
          Edit
        </span>
      }
      width="max-w-xl"
    >
      <TicketForm
        action={updateTicketAction}
        values={values}
        assignees={assignees}
        submitLabel="Save"
        closeOnSuccess
      />
    </Modal>
  );
}
