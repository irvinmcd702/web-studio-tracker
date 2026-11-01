import Link from "next/link";
import { notFound } from "next/navigation";
import { Trash2 } from "lucide-react";

import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { canWriteDocs, docScope } from "@/lib/docs";
import { deleteDocAction, toggleDocSharingAction } from "@/app/actions/docs";
import { formatDateTime } from "@/lib/utils";
import { Badge, Card, PageHeader } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { DocView } from "@/components/docs/doc-view";
import { ConfirmIconSubmit } from "@/components/ui/confirm-submit";
import { SubmitButton } from "@/components/ui/form";

export default async function DocPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireStaff();
  const { id } = await params;

  const doc = await prisma.doc.findFirst({
    where: { AND: [{ id }, docScope(user)] },
    include: { project: true, createdBy: true, updatedBy: true },
  });
  if (!doc) notFound();

  const canEdit = canWriteDocs(user);

  return (
    <>
      <PageHeader
        title={doc.title}
        breadcrumb={
          doc.project ? (
            <>
              <Link href="/docs" className="hover:underline">
                Docs
              </Link>
              {" · "}
              <Link
                href={`/projects/${doc.project.id}/docs`}
                className="hover:underline"
              >
                {doc.project.name}
              </Link>
            </>
          ) : (
            <Link href="/docs" className="hover:underline">
              Docs
            </Link>
          )
        }
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            {doc.isClientVisible ? (
              <Badge color="#16a34a">shared with client</Badge>
            ) : doc.project ? (
              <Badge color="#64748b">studio only</Badge>
            ) : null}
            <span>
              {doc.updatedBy ? `Last edited by ${doc.updatedBy.name}, ` : ""}
              {formatDateTime(doc.updatedAt)}
            </span>
          </span>
        }
        action={
          canEdit ? (
            <span className="flex items-center gap-2">
              {doc.project ? (
                <form action={toggleDocSharingAction}>
                  <input type="hidden" name="id" value={doc.id} />
                  <SubmitButton
                    size="sm"
                    variant="secondary"
                    pendingText="Saving…"
                  >
                    {doc.isClientVisible ? "Stop sharing" : "Share with client"}
                  </SubmitButton>
                </form>
              ) : null}
              <form action={deleteDocAction}>
                <input type="hidden" name="id" value={doc.id} />
                <ConfirmIconSubmit title="Delete this doc">
                  <Trash2 size={14} />
                </ConfirmIconSubmit>
              </form>
            </span>
          ) : null
        }
      />

      <Card className="max-w-4xl px-6 py-5">
        <DocView
          doc={{
            id: doc.id,
            title: doc.title,
            body: doc.body,
            isClientVisible: doc.isClientVisible,
          }}
          projectId={doc.projectId}
          canEdit={canEdit}
          canShare={Boolean(doc.projectId)}
        />
      </Card>
    </>
  );
}
