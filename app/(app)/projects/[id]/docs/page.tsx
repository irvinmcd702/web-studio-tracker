import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, Plus } from "lucide-react";

import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { canAccessProject } from "@/lib/permissions";
import { canWriteDocs, docExcerpt } from "@/lib/docs";
import { portalSettings } from "@/lib/portal";
import { formatRelative } from "@/lib/utils";
import { buttonClass } from "@/components/ui/button";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
} from "@/components/ui/primitives";

export default async function ProjectDocsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireStaff();
  const { id } = await params;
  if (!(await canAccessProject(user, id))) notFound();

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) notFound();

  const docs = await prisma.doc.findMany({
    where: { projectId: id },
    orderBy: { updatedAt: "desc" },
    include: { updatedBy: true },
  });

  const canEdit = canWriteDocs(user);
  const portal = portalSettings(project);
  const shared = docs.filter((d) => d.isClientVisible).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-[var(--color-muted)]">
          {docs.length} doc(s)
          {shared > 0 ? ` · ${shared} shared with the client` : ""}
        </p>
        {canEdit ? (
          <Link
            href={`/docs/new?projectId=${id}`}
            className={buttonClass("primary", "sm")}
          >
            <Plus size={15} />
            New doc
          </Link>
        ) : null}
      </div>

      {shared > 0 && !portal.docs ? (
        <div className="rounded-lg bg-[var(--color-warn-soft)] px-4 py-3 text-[13px] text-[var(--color-warn)]">
          Documents are switched off for this project&rsquo;s portal, so the
          client can&rsquo;t see the shared ones. Turn them on in the project
          settings.
        </div>
      ) : null}

      <Card className="overflow-hidden">
        <CardHeader
          title="Project docs"
          description="Brief, spec, meeting notes — anything the team writes down"
        />
        {docs.length === 0 ? (
          <EmptyState
            icon={<FileText size={30} />}
            title="No docs yet"
            description="Write the brief once, and stop answering the same question in chat."
          />
        ) : (
          <ul className="divide-y divide-[var(--color-line)]">
            {docs.map((doc) => {
              const excerpt = docExcerpt(doc.body);
              return (
                <li key={doc.id}>
                  <Link
                    href={`/docs/${doc.id}`}
                    className="flex items-start gap-3 px-5 py-3.5 transition hover:bg-[var(--color-hover)]"
                  >
                    <FileText
                      size={16}
                      className="mt-0.5 shrink-0 text-[var(--color-faint)]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-[13.5px] font-medium">
                          {doc.title}
                        </span>
                        {doc.isClientVisible ? (
                          <Badge color="#16a34a">shared with client</Badge>
                        ) : null}
                      </span>
                      {excerpt ? (
                        <span className="mt-0.5 block truncate text-[12.5px] text-[var(--color-muted)]">
                          {excerpt}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-[11.5px] text-[var(--color-muted)]">
                      {doc.updatedBy ? `${doc.updatedBy.name} · ` : ""}
                      {formatRelative(doc.updatedAt)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
