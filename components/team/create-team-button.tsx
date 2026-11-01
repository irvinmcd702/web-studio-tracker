"use client";

import { Plus } from "lucide-react";

import { createTeamAction } from "@/app/actions/teams";
import { Modal } from "@/components/ui/modal";
import { TeamForm } from "@/components/team/team-form";

export function CreateTeamButton({
  people,
}: {
  people: { id: string; name: string; extra?: string }[];
}) {
  return (
    <Modal
      title="New team"
      description="Teams are attached to projects as a whole"
      trigger={
        <span className="inline-flex items-center gap-1.5">
          <Plus size={15} />
          New team
        </span>
      }
    >
      <TeamForm action={createTeamAction} people={people} />
    </Modal>
  );
}
