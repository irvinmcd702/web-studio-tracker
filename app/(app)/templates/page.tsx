import Link from "next/link";
import { redirect } from "next/navigation";
import { Trash2 } from "lucide-react";

import { requireStaff } from "@/lib/auth";
import { canConfigure } from "@/lib/permissions";
import { listTemplates } from "@/lib/templates";
import { deleteTemplateAction } from "@/app/actions/projects";
import { formatDate, formatHours } from "@/lib/utils";
import { prisma } from "@/lib/db";
import {
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
} from "@/components/ui/primitives";
import { buttonClass } from "@/components/ui/button";
import { ConfirmIconSubmit } from "@/components/ui/confirm-submit";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const user = await requireStaff();
  if (!canConfigure(user)) redirect("/dashboard");

  const templates = await listTemplates();

  const items = await prisma.projectTemplateItem.findMany({
    where: { templateId: { in: templates.map((t) => t.id) } },
    orderBy: { position: "asc" },
  });
  const byTemplate = new Map<string, typeof items>();
  for (const item of items) {
    const list = byTemplate.get(item.templateId) ?? [];
    list.push(item);
    byTemplate.set(item.templateId, list);
  }

  return (
    <>
      <PageHeader
        title="Project templates"
        description="The shapes this studio builds over and over"
      />

      {templates.length === 0 ? (
        <Card>
          <EmptyState
            title="No templates yet"
            description="A template is made by saving a project that went well — open any project's settings and use “Save as template”. There is no blank form to fill in, because the tickets a job needed are already sitting in the job that needed them."
          />
        </Card>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          {templates.map((template) => {
            const list = byTemplate.get(template.id) ?? [];
            const estimated = list.filter((i) => i.estimate != null);
            const hours = estimated.reduce((s, i) => s + (i.estimate ?? 0), 0);

            return (
              <Card key={template.id} className="h-fit">
                <CardHeader
                  title={template.name}
                  description={template.description ?? undefined}
                  action={
                    <div className="flex items-center gap-1">
                      <Link
                        href={`/projects/new?template=${template.id}`}
                        className={buttonClass("secondary", "sm")}
                      >
                        Use
                      </Link>
                      <form action={deleteTemplateAction}>
                        <input type="hidden" name="id" value={template.id} />
                        <ConfirmIconSubmit title="Delete this template">
                          <Trash2 size={14} />
                        </ConfirmIconSubmit>
                      </form>
                    </div>
                  }
                />

                <dl className="grid gap-2 border-b border-[var(--color-line)] px-5 py-3 text-[12.5px] sm:grid-cols-3">
                  <div>
                    <dt className="text-[var(--color-muted)]">Workflow</dt>
                    <dd className="mt-0.5 font-medium">
                      {template.workflow?.name ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--color-muted)]">Tickets</dt>
                    <dd className="num mt-0.5 font-medium">
                      {template._count.items}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--color-muted)]">Estimated</dt>
                    <dd className="num mt-0.5 font-medium">
                      {estimated.length
                        ? `${formatHours(hours)}${
                            estimated.length < list.length
                              ? ` · ${list.length - estimated.length} without`
                              : ""
                          }`
                        : "not estimated"}
                    </dd>
                  </div>
                </dl>

                <ul className="divide-y divide-[var(--color-line)]">
                  {list.slice(0, 8).map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center gap-3 px-5 py-2.5"
                    >
                      <span className="min-w-0 flex-1 truncate text-[13px]">
                        {item.title}
                      </span>
                      {item.dueAfterDays != null ? (
                        <span className="num shrink-0 text-[11.5px] text-[var(--color-muted)]">
                          day {item.dueAfterDays}
                        </span>
                      ) : null}
                      <span className="num shrink-0 text-[12px] text-[var(--color-muted)]">
                        {item.estimate != null
                          ? formatHours(item.estimate)
                          : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
                {list.length > 8 ? (
                  <p className="border-t border-[var(--color-line)] px-5 py-2 text-[12.5px] text-[var(--color-muted)]">
                    …and {list.length - 8} more.
                  </p>
                ) : null}

                <p className="border-t border-[var(--color-line)] px-5 py-2.5 text-[11.5px] text-[var(--color-muted)]">
                  Saved by {template.createdBy?.name ?? "someone"} on{" "}
                  {formatDate(template.createdAt)}. Nothing here carries an
                  assignee or a status.
                </p>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
