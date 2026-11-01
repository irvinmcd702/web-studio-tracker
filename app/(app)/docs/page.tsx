import Link from "next/link";
import { FileText, Plus } from "lucide-react";

import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { canWriteDocs, docExcerpt, docScope } from "@/lib/docs";
import { formatRelative } from "@/lib/utils";
import { buttonClass } from "@/components/ui/button";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
} from "@/components/ui/primitives";

export default async function DocsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireStaff();
  const { q = "" } = await searchParams;

  const docs = await prisma.doc.findMany({
    where: {
      AND: [
        docScope(user),
        q
          ? {
              OR: [
                { title: { contains: q, mode: "insensitive" as const } },
                { body: { contains: q, mode: "insensitive" as const } },
              ],
            }
          : {},
      ],
    },
    orderBy: { updatedAt: "desc" },
    include: { project: true, updatedBy: true },
  });

  // Studio-wide docs first, then one section per project.
  const studio = docs.filter((d) => !d.projectId);
  const byProject = new Map<string, typeof docs>();
  for (const doc of docs) {
    if (!doc.projectId) continue;
    const list = byProject.get(doc.projectId) ?? [];
    list.push(doc);
    byProject.set(doc.projectId, list);
  }

  const sections = [
    {
      key: "studio",
      title: "Studio",
      subtitle: "Not tied to a project",
      docs: studio,
    },
    ...[...byProject.entries()].map(([projectId, list]) => ({
      key: projectId,
      title: list[0]!.project!.name,
      subtitle: list[0]!.project!.key,
      docs: list,
    })),
  ].filter((s) => s.docs.length > 0);

  return (
    <>
      <PageHeader
        title="Docs"
        description="Briefs, specs, meeting notes — kept next to the work"
        action={
          canWriteDocs(user) ? (
            <Link href="/docs/new" className={buttonClass("primary", "md")}>
              <Plus size={16} />
              New doc
            </Link>
          ) : null
        }
      />

      <form className="mb-4 max-w-md" action="/docs">
        <input
          name="q"
          defaultValue={q}
          aria-label="Search documents"
          placeholder="Search titles and text"
          className="field"
        />
      </form>

      {sections.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FileText size={30} />}
            title={q ? "Nothing found" : "No docs yet"}
            description={
              q
                ? "Try a different search."
                : "Write the brief once and everyone works from the same page."
            }
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {sections.map((section) => (
            <Card key={section.key} className="overflow-hidden">
              <CardHeader
                title={section.title}
                description={section.subtitle}
              />
              <ul className="divide-y divide-[var(--color-line)]">
                {section.docs.map((doc) => {
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
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
