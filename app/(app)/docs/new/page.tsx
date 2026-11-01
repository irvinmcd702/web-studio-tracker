import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { canAccessProject } from "@/lib/permissions";
import { canWriteDocs } from "@/lib/docs";
import { Card, PageHeader } from "@/components/ui/primitives";
import { DocEditor } from "@/components/docs/doc-editor";

export default async function NewDocPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const user = await requireStaff();
  if (!canWriteDocs(user)) redirect("/docs");

  const { projectId } = await searchParams;

  const project =
    projectId && (await canAccessProject(user, projectId))
      ? await prisma.project.findUnique({ where: { id: projectId } })
      : null;

  return (
    <>
      <PageHeader
        title="New doc"
        breadcrumb={
          project ? (
            <Link
              href={`/projects/${project.id}/docs`}
              className="hover:underline"
            >
              {project.name}
            </Link>
          ) : (
            <Link href="/docs" className="hover:underline">
              Docs
            </Link>
          )
        }
        description={
          project
            ? `Belongs to ${project.key} · ${project.name}`
            : "A studio-wide doc, not tied to any project"
        }
      />

      <Card className="max-w-4xl p-6">
        <DocEditor
          projectId={project?.id ?? null}
          canShare={Boolean(project)}
        />
      </Card>
    </>
  );
}
