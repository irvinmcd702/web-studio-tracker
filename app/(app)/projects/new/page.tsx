import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { canEditProject } from "@/lib/permissions";
import { createProjectAction } from "@/app/actions/projects";
import { getDefaultPortalValues, getStudioSettings } from "@/lib/settings";
import { pickPortalValues } from "@/lib/portal";
import { staffForCrew } from "@/lib/queries";
import { Card, PageHeader } from "@/components/ui/primitives";
import { ProjectForm } from "@/components/project/project-form";

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ requestId?: string; template?: string }>;
}) {
  const user = await requireStaff();
  if (!canEditProject(user)) redirect("/projects");

  const { requestId, template: templateId } = await searchParams;

  const [
    clients,
    managers,
    workflows,
    people,
    request,
    portalDefaults,
    studio,
  ] = await Promise.all([
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
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      include: { _count: { select: { statuses: true } } },
    }),
    staffForCrew(),
    requestId
      ? prisma.clientRequest.findUnique({
          where: { id: requestId },
          include: { client: true },
        })
      : Promise.resolve(null),
    getDefaultPortalValues(),
    getStudioSettings(),
  ]);

  // A template only ever *prefills* this form. Whatever is submitted wins, and
  // the tickets are created afterwards from whichever template id comes back
  // with the form — so changing your mind here changes what you get.
  const template = templateId
    ? await prisma.projectTemplate.findUnique({
        where: { id: templateId },
        include: { _count: { select: { items: true } } },
      })
    : null;

  if (workflows.length === 0) {
    return (
      <>
        <PageHeader title="New project" />
        <Card className="p-6">
          <p className="text-sm">
            Create at least one workflow first — it defines ticket statuses.
          </p>
          <Link
            href="/workflows"
            className="mt-3 inline-block text-sm font-medium text-[var(--color-brand)] hover:underline"
          >
            Go to workflows →
          </Link>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="New project"
        breadcrumb={
          <Link href="/projects" className="hover:underline">
            Projects
          </Link>
        }
        description={
          template
            ? `Starting from the “${template.name}” template — ${template._count.items} ticket(s) will be created once you save`
            : request
              ? `Created from the “${request.title}” request — it will be marked as converted once saved`
              : "Fill in the project details, pick who works on it and set the budget"
        }
      />

      {template ? (
        <Card className="mb-6 max-w-4xl px-5 py-4">
          <p className="text-[13px] leading-relaxed text-[var(--color-muted)]">
            The budget, workflow and portal answers below came from the template
            — change any of them and the change wins. The tickets are created
            after the project is, unassigned and at the start of whichever
            workflow you leave selected.{" "}
            <Link
              href="/projects/new"
              className="font-medium text-[var(--color-brand)] hover:underline"
            >
              Start from nothing instead
            </Link>
          </p>
        </Card>
      ) : null}

      <Card className="max-w-4xl p-6">
        <ProjectForm
          action={createProjectAction}
          requestId={request?.id}
          portalDefaults={
            template ? pickPortalValues(template) : portalDefaults
          }
          showRocketChatChannel={studio.rocketChatEnabled}
          templateId={template?.id}
          values={{
            name: request?.title,
            description: request?.description ?? null,
            clientId: request?.clientId ?? null,
            managerId: request?.ownerId ?? user.id,
            workflowId: template?.workflowId ?? workflows[0]!.id,
            status: "ACTIVE",
            budgetType: template?.budgetType,
            budgetHours: template?.budgetHours,
            hourlyRate: template?.hourlyRate,
            fixedAmount: template?.fixedAmount,
            currency: template?.currency,
          }}
          clients={clients.map((c) => ({ id: c.id, name: c.name }))}
          managers={managers.map((m) => ({
            id: m.id,
            name: m.name,
            extra: m.position ?? undefined,
          }))}
          workflows={workflows.map((w) => ({
            id: w.id,
            name: w.name,
            extra: `${w._count.statuses} statuses${w.isDefault ? ", default" : ""}`,
          }))}
          people={people}
        />
      </Card>
    </>
  );
}
