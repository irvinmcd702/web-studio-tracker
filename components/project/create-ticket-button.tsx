"use client";

import { Plus } from "lucide-react";

import { createTicketAction } from "@/app/actions/tickets";
import { Modal } from "@/components/ui/modal";
import { TicketForm } from "@/components/project/ticket-form";

export function CreateTicketButton({
  projectId,
  assignees,
  statuses,
}: {
  projectId: string;
  assignees: { id: string; name: string; extra?: string }[];
  statuses: { id: string; name: string }[];
}) {
  return (
    <Modal
      title="New ticket"
      description="The task lands in the selected board column"
      trigger={
        <span className="inline-flex items-center gap-1.5">
          <Plus size={15} />
          New ticket
        </span>
      }
      width="max-w-xl"
    >
      <TicketForm
        action={createTicketAction}
        projectId={projectId}
        assignees={assignees}
        statuses={statuses}
        closeOnSuccess
      />
    </Modal>
  );
}
