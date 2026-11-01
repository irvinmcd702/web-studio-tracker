import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Plus, X } from "lucide-react";

import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { canConfigure } from "@/lib/permissions";
import {
  addTeamMemberAction,
  deleteTeamAction,
  removeTeamMemberAction,
  updateTeamAction,
} from "@/app/actions/teams";
import { roleLabels } from "@/lib/labels";
import {
  Avatar,
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
} from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { TeamForm } from "@/components/team/team-form";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { ConfirmIconSubmit } from "@/components/ui/confirm-submit";
import { SubmitButton } from "@/components/ui/form";

export default async function TeamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireStaff();
  if (!canConfigure(user)) redirect("/dashboard");

  const { id } = await params;
  const team = await prisma.team.findUnique({
    where: { id },
    include: {
      members: {
        include: {
          user: { include: { projectRoles: { include: { project: true } } } },
        },
        orderBy: { joinedAt: "asc" },
      },
    },
  });
  if (!team) notFound();

  // Roll the members' project crews up into one list, counting how many of
  // this team sit on each project.
  const projectRollup = new Map<
    string,
    { id: string; key: string; name: string; status: string; count: number }
  >();
  for (const member of team.members) {
    for (const role of member.user.projectRoles) {
      const entry = projectRollup.get(role.projectId);
      if (entry) {
        entry.count += 1;
      } else {
        projectRollup.set(role.projectId, {
          id: role.project.id,
          key: role.project.key,
          name: role.project.name,
          status: role.project.status,
          count: 1,
        });
      }
    }
  }
  const projects = [...projectRollup.values()].sort((a, b) =>
    a.key.localeCompare(b.key, "en-US"),
  );

  const memberIds = new Set(team.members.map((m) => m.userId));
  const candidates = await prisma.user.findMany({
    where: {
      isActive: true,
      role: { in: ["ADMIN", "MANAGER", "MEMBER"] },
      id: { notIn: [...memberIds] },
    },
    orderBy: { name: "asc" },
  });

  return (
    <>
      <PageHeader
        title={team.name}
        breadcrumb={
          <Link href="/teams" className="hover:underline">
            Teams
          </Link>
        }
        description={team.description ?? undefined}
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader
              title="Members"
              description={`${team.members.length} people`}
            />
            {team.members.length === 0 ? (
              <EmptyState title="No members yet" />
            ) : (
              <ul className="divide-y divide-[var(--color-line)]">
                {team.members.map((member) => (
                  <li
                    key={member.id}
                    className="flex items-center gap-3 px-5 py-3"
                  >
                    <Avatar
                      name={member.user.name}
                      color={member.user.avatarColor}
                      size={32}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-medium">
                        {member.user.name}
                      </p>
                      <p className="truncate text-[12px] text-[var(--color-muted)]">
                        {member.title ??
                          member.user.position ??
                          roleLabels[member.user.role]}
                        {" · "}
                        {member.user.email}
                      </p>
                    </div>
                    <form action={removeTeamMemberAction}>
                      <input type="hidden" name="teamId" value={team.id} />
                      <input
                        type="hidden"
                        name="userId"
                        value={member.userId}
                      />
                      <ConfirmIconSubmit title="Remove from the team">
                        <X size={15} />
                      </ConfirmIconSubmit>
                    </form>
                  </li>
                ))}
              </ul>
            )}

            {candidates.length > 0 ? (
              <form
                action={addTeamMemberAction}
                className="flex flex-wrap gap-2 border-t border-[var(--color-line)] px-5 py-4"
              >
                <input type="hidden" name="teamId" value={team.id} />
                <select
                  name="userId"
                  aria-label="Person to add to the team"
                  defaultValue=""
                  required
                  className="field flex-1 min-w-48"
                >
                  <option value="" disabled>
                    Choose a person…
                  </option>
                  {candidates.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                      {person.position ? ` · ${person.position}` : ""}
                    </option>
                  ))}
                </select>
                <input
                  name="title"
                  aria-label="Role in the team"
                  placeholder="Role in the team (optional)"
                  className="field w-full sm:w-56"
                />
                <SubmitButton variant="secondary" pendingText="Adding…">
                  <Plus size={15} />
                  Add
                </SubmitButton>
              </form>
            ) : null}
          </Card>

          <Card>
            <CardHeader
              title="Where these people are working"
              description="Projects their crews include them on"
            />
            {projects.length === 0 ? (
              <EmptyState
                title="Nobody here is on a project yet"
                description="Add them to a project crew from its settings."
              />
            ) : (
              <ul className="divide-y divide-[var(--color-line)]">
                {projects.map((project) => (
                  <li key={project.id}>
                    <Link
                      href={`/projects/${project.id}`}
                      className="flex items-center gap-3 px-5 py-3 transition hover:bg-[var(--color-hover)]"
                    >
                      <span className="rounded bg-[var(--color-surface-3)] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[var(--color-ink-2)]">
                        {project.key}
                      </span>
                      <span className="flex-1 text-[13.5px] font-medium">
                        {project.name}
                      </span>
                      <span className="text-[12px] text-[var(--color-muted)]">
                        {project.count} from this team
                      </span>
                      <Badge>{project.status}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-4 text-[15px] font-semibold">Team settings</h2>
            <TeamForm
              action={updateTeamAction}
              submitLabel="Save"
              values={{
                id: team.id,
                name: team.name,
                description: team.description,
                color: team.color,
              }}
            />
          </Card>

          <Card className="border-[var(--color-danger-line)]">
            <CardHeader title="Delete" />
            <div className="px-5 py-4">
              <form action={deleteTeamAction}>
                <input type="hidden" name="id" value={team.id} />
                <ConfirmSubmit
                  question="Delete this team?"
                  confirmLabel="Delete team"
                >
                  Delete team
                </ConfirmSubmit>
              </form>
              <p className="mt-2 text-[12px] text-[var(--color-muted)]">
                Deleting a team leaves its people exactly where they are — team
                membership is a label, not project access.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
