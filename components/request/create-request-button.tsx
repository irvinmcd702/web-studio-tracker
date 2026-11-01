"use client";

import { Plus } from "lucide-react";

import { createRequestAction } from "@/app/actions/requests";
import { Modal } from "@/components/ui/modal";
import { RequestForm } from "@/components/request/request-form";

export function CreateRequestButton({
  clients,
}: {
  clients: { id: string; name: string }[];
}) {
  return (
    <Modal
      title="New request"
      description="An inquiry that arrived by phone, email or referral"
      trigger={
        <span className="inline-flex items-center gap-1.5">
          <Plus size={15} />
          New request
        </span>
      }
      width="max-w-xl"
    >
      <RequestForm
        action={createRequestAction}
        clients={clients}
        closeOnSuccess
      />
    </Modal>
  );
}
