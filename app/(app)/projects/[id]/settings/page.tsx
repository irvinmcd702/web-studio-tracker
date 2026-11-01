import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Plus, X } from "lucide-react";

import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { canAccessProject, canEditProject } from "@/lib/permissions";
import { getStudioSettings } from "@/lib/settings";
import { pickPortalValues } from "@/lib/portal";
import {
  addProjectMemberAction,
  addTeamToProjectAction,
  deleteProjectAction,
  grantProjectAccessAction,
  removeProjectMemberAction,
  revokeProjectAccessAction,
  updateProjectAction,
} from "@/app/actions/projects";
import { Avatar, Badge, Card, CardHeader } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { ProjectForm } from "@/components/project/project-form";
import { WorkflowSwitcher } from "@/components/project/workflow-switcher";
import { PortalSettingsForm } from "@/components/project/portal-settings-form";
import { ProjectAiForm } from "@/components/project/ai-form";
import { ProjectConfidentialForm } from "@/components/project/confidential-form";
import { SaveAsTemplate } from "@/components/project/save-as-template";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { ConfirmIconSubmit } from "@/components/ui/confirm-submit";
import { SubmitButton } from "@/components/ui/form";

function toDateInput(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : "";
}

export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireStaff();
  const { id } = await params;
  if (!(await canAccessProject(user, id))) notFound();
  if (!canEditProject(user)) redirect(`/projects/${id}`);

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      members: { include: { user: true }, orderBy: { addedAt: "asc" } },
      allowed: {
        include: { user: true, grantedBy: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!project) notFound();

  const [clients, managers, workflows, allTeams, studio] = await Promise.all([
    prisma.client.findMany({
      where: { isArchived: false },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { isActive: true, role: { in: ["ADMIN", "MANAGER", "MEMBER"] } },
      orderBy: { name: "asc" },
    }),
    prisma.workflow.findMany({
      where: { isArchived: false },
      orderBy: { name: "asc" },
      include: { _count: { select: { statuses: true } } },
    }),
    prisma.team.findMany({
      where: { isArchived: false },
      orderBy: { name: "asc" },
      include: { _count: { select: { members: true } } },
    }),
    getStudioSettings(),
  ]);

  const ticketCount = await prisma.ticket.count({ where: { projectId: id } });

  const clientName =
    clients.find((client) => client.id === project.clientId)?.name ?? null;

  const onCrew = new Set(project.members.map((m) => m.userId));
  const notOnCrew = managers.filter((person) => !onCrew.has(person.id));

  // Who keeps access whatever the switch says, named rather than counted.
  const adminNames = managers
    .filter((person) => person.role === "ADMIN")
    .map((person) => person.name);

  // Nobody who already sees it another way: offering to "let in" the person
  // who is on the crew would suggest the list is doing something it is not.
  const alreadyIn = new Set([
    ...project.allowed.map((entry) => entry.userId),
    ...project.members.map((m) => m.userId),
    ...(project.managerId ? [project.managerId] : []),
  ]);
  const canBeLetIn = managers.filter((person) => !alreadyIn.has(person.id));

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <div className="xl:col-span-2">
        <Card className="p-6">
          <h2 className="mb-5 text-[15px] font-semibold">Project details</h2>
          <ProjectForm
            action={updateProjectAction}
            submitLabel="Save"
            showCrew={false}
            // The Workflow card below is the only place this changes, because
            // changing it moves every ticket on the project.
            showWorkflow={false}
            showRocketChatChannel={studio.rocketChatEnabled}
            clients={clients.map((c) => ({ id: c.id, name: c.name }))}
            managers={managers.map((m) => ({
              id: m.id,
              name: m.name,
              extra: m.position ?? undefined,
            }))}
            workflows={workflows.map((w) => ({ id: w.id, name: w.name }))}
            people={[]}
            values={{
              id: project.id,
              name: project.name,
              key: project.key,
              description: project.description,
              status: project.status,
              clientId: project.clientId,
              managerId: project.managerId,
              workflowId: project.workflowId,
              startDate: toDateInput(project.startDate),
              dueDate: toDateInput(project.dueDate),
              budgetType: project.budgetType,
              budgetHours: project.budgetHours,
              hourlyRate: project.hourlyRate,
              fixedAmount: project.fixedAmount,
              currency: project.currency,
              rocketChatChannel: project.rocketChatChannel,
            }}
          />
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader
            title="Who works on this project"
            description="Only these people (and the PM) can be assigned tickets"
          />
          <div className="space-y-3 px-5 py-4">
            {project.members.length === 0 ? (
              <p className="text-[13px] text-[var(--color-muted)]">
                Nobody picked yet — while the crew is empty, any staff member
                can be assigned a ticket here.
              </p>
            ) : (
              <ul className="space-y-2">
                {project.members.map((member) => (
                  <li
                    key={member.id}
                    className="flex items-center gap-2.5 rounded-lg border border-[var(--color-line)] px-3 py-2"
                  >
                    <Avatar
                      name={member.user.name}
                      color={member.user.avatarColor}
                      size={28}
                    />
                    <span className="flex-1 text-[13.5px]">
                      {member.user.name}
                      {member.role ? (
                        <span className="ml-2 text-[12px] text-[var(--color-muted)]">
                          {member.role}
                        </span>
                      ) : null}
                    </span>
                    <form action={removeProjectMemberAction}>
                      <input
                        type="hidden"
                        name="projectId"
                        value={project.id}
                      />
                      <input
                        type="hidden"
                        name="userId"
                        value={member.userId}
                      />
                      <ConfirmIconSubmit title="Take off the project">
                        <X size={15} />
                      </ConfirmIconSubmit>
                    </form>
                  </li>
                ))}
              </ul>
            )}

            {notOnCrew.length > 0 ? (
              <form action={addProjectMemberAction} className="space-y-2">
                <input type="hidden" name="projectId" value={project.id} />
                <div className="flex gap-2">
                  <select
                    name="userId"
                    aria-label="Person to add to the project"
                    className="field flex-1"
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Add a person…
                    </option>
                    {notOnCrew.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name}
                        {person.position ? ` · ${person.position}` : ""}
                      </option>
                    ))}
                  </select>
                  <SubmitButton
                    size="md"
                    variant="secondary"
                    pendingText="…"
                    aria-label="Add the selected person to the project"
                  >
                    <Plus size={15} />
                  </SubmitButton>
                </div>
                <input
                  name="role"
                  aria-label="Role on this project"
                  className="field"
                  placeholder="Role on this project (optional)"
                />
              </form>
            ) : (
              <p className="text-[13px] text-[var(--color-muted)]">
                Everyone on staff is already on this project.
              </p>
            )}

            {allTeams.length > 0 ? (
              <form
                action={addTeamToProjectAction}
                className="flex gap-2 border-t border-[var(--color-line)] pt-3"
              >
                <input type="hidden" name="projectId" value={project.id} />
                <select
                  name="teamId"
                  aria-label="Team to add to the project"
                  className="field flex-1"
                  defaultValue=""
                >
                  <option value="" disabled>
                    Add everyone from a team…
                  </option>
                  {allTeams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name} · {team._count.members}{" "}
                      {team._count.members === 1 ? "person" : "people"}
                    </option>
                  ))}
                </select>
                <SubmitButton
                  size="md"
                  variant="secondary"
                  pendingText="…"
                  aria-label="Add everyone from the selected team"
                >
                  <Plus size={15} />
                </SubmitButton>
              </form>
            ) : (
              <Link
                href="/teams"
                className="block text-[13px] font-medium text-[var(--color-brand)] hover:underline"
              >
                Create a team →
              </Link>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Client portal"
            description="What the customer sees at /portal for this project"
          />
          <div className="px-5 py-4">
            <PortalSettingsForm
              projectId={project.id}
              hasClient={Boolean(project.clientId)}
              values={pickPortalValues(project)}
            />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Drafting with a model"
            description="Whether this project's material may be sent to the model provider"
          />
          <div className="px-5 py-4">
            <ProjectAiForm
              projectId={project.id}
              allowed={project.aiAllowed}
              studioEnabled={studio.aiEnabled}
              clientName={clientName}
            />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Who can see this project"
            description="Closed projects are hidden from managers who are not on them"
          />
          <div className="px-5 py-4">
            <ProjectConfidentialForm
              projectId={project.id}
              closed={project.isConfidential}
              adminNames={adminNames}
            />
          </div>

          {project.isConfidential ? (
            <div className="border-t border-[var(--color-line)] px-5 py-4">
              <p className="mb-3 text-[12.5px] font-medium text-[var(--color-ink-2)]">
                Let in by name
              </p>

              {project.allowed.length === 0 ? (
                <p className="mb-3 text-[12.5px] text-[var(--color-muted)]">
                  Nobody yet. Only the crew and the project manager can see it.
                </p>
              ) : (
                <ul className="mb-3 space-y-2">
                  {project.allowed.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex items-center justify-between gap-3"
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <Avatar
                          name={entry.user.name}
                          color={entry.user.avatarColor}
                          size={24}
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-[13px]">
                            {entry.user.name}
                          </span>
                          <span className="block text-[11.5px] text-[var(--color-muted)]">
                            {entry.grantedBy
                              ? `let in by ${entry.grantedBy.name}`
                              : "let in"}
                          </span>
                        </span>
                      </span>
                      <form action={revokeProjectAccessAction}>
                        <input type="hidden" name="id" value={project.id} />
                        <input
                          type="hidden"
                          name="userId"
                          value={entry.userId}
                        />
                        <ConfirmIconSubmit title="Take off this project's list">
                          <X size={14} />
                        </ConfirmIconSubmit>
                      </form>
                    </li>
                  ))}
                </ul>
              )}

              {canBeLetIn.length > 0 ? (
                <form
                  action={grantProjectAccessAction}
                  className="flex items-center gap-2"
                >
                  <input type="hidden" name="id" value={project.id} />
                  <select
                    name="userId"
                    aria-label="Person to give access to"
                    className="field flex-1"
                    required
                  >
                    {canBeLetIn.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name}
                      </option>
                    ))}
                  </select>
                  <SubmitButton size="sm" variant="secondary">
                    <Plus size={14} />
                    Let in
                  </SubmitButton>
                </form>
              ) : (
                <p className="text-[12.5px] text-[var(--color-muted)]">
                  Everybody in the studio can already see it one way or another.
                </p>
              )}
            </div>
          ) : null}
        </Card>

        <Card>
          <CardHeader title="Workflow" />
          <div className="px-5 py-4">
            <WorkflowSwitcher
              projectId={project.id}
              currentWorkflowId={project.workflowId}
              workflows={workflows.map((w) => ({
                id: w.id,
                name: w.name,
                statusCount: w._count.statuses,
              }))}
            />
            <Link
              href={`/workflows/${project.workflowId}`}
              className="mt-3 inline-block text-[13px] font-medium text-[var(--color-brand)] hover:underline"
            >
              Edit the current workflow →
            </Link>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Reuse this shape"
            description="The next project like this one can start with the tickets this one needed"
          />
          <div className="px-5 py-4">
            <SaveAsTemplate projectId={project.id} ticketCount={ticketCount} />
          </div>
        </Card>

        {user.role === "ADMIN" ? (
          <Card className="border-[var(--color-danger-line)]">
            <CardHeader
              title="Danger zone"
              description="Deleting wipes the tickets, chat, files and time entries"
            />
            <div className="px-5 py-4">
              <form action={deleteProjectAction}>
                <input type="hidden" name="id" value={project.id} />
                <ConfirmSubmit
                  question="Delete this project and everything in it?"
                  confirmLabel="Delete project"
                >
                  Delete project
                </ConfirmSubmit>
              </form>
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
