import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { canAccessProject, canEditProject } from "@/lib/permissions";
import { formatBytes } from "@/lib/media";
import { ticketKey } from "@/lib/utils";
import { Card, CardHeader } from "@/components/ui/primitives";
import { FileUpload } from "@/components/project/file-upload";
import { AttachmentList } from "@/components/attachment/attachment-list";

export default async function ProjectFilesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireStaff();
  const { id } = await params;
  if (!(await canAccessProject(user, id))) notFound();

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) notFound();

  const files = await prisma.attachment.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "desc" },
    include: { uploadedBy: true, ticket: true },
  });

  const canEdit = canEditProject(user);
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  return (
    <div className="grid gap-6 xl:grid-cols-4">
      <Card className="overflow-hidden xl:col-span-3">
        <CardHeader
          title="Project files"
          description={`${files.length} file(s) · ${formatBytes(totalSize)}`}
        />
        <AttachmentList
          canManage={canEdit}
          canToggleVisibility={canEdit}
          showVisibility
          emptyTitle="No files yet"
          emptyDescription="Upload specs, designs, contracts or credentials — all in one place."
          items={files.map((file) => ({
            id: file.id,
            originalName: file.originalName,
            mimeType: file.mimeType,
            size: file.size,
            createdAt: file.createdAt.toISOString(),
            isClientVisible: file.isClientVisible,
            uploadedBy: {
              name: file.uploadedBy.name,
              avatarColor: file.uploadedBy.avatarColor,
            },
            ticket: file.ticket
              ? {
                  id: file.ticket.id,
                  key: ticketKey(project.key, file.ticket.number),
                }
              : null,
          }))}
        />
      </Card>

      {canEdit ? (
        <Card className="h-fit">
          <CardHeader title="Upload a file" />
          <div className="px-5 py-4">
            <FileUpload projectId={id} />
          </div>
        </Card>
      ) : null}
    </div>
  );
}
