import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";

import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { canConfigure } from "@/lib/permissions";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { CreateClientButton } from "@/components/client/client-form";

export default async function ClientsPage() {
  const user = await requireStaff();
  if (!canConfigure(user)) redirect("/dashboard");

  const clients = await prisma.client.findMany({
    where: { isArchived: false },
    orderBy: { name: "asc" },
    include: {
      _count: { select: { projects: true, users: true, requests: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="Clients"
        description="Customer companies and their portal access"
        action={<CreateClientButton />}
      />

      <Card className="overflow-hidden">
        {clients.length === 0 ? (
          <EmptyState
            icon={<Building2 size={30} />}
            title="No clients yet"
            description="Add a client manually or create one straight from a request."
          />
        ) : (
          <div className="overflow-x-auto scroll-thin">
            <table className="table-base min-w-[760px]">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Contacts</th>
                  <th className="w-28">Projects</th>
                  <th className="w-28">Requests</th>
                  <th className="w-36">Portal</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr
                    key={client.id}
                    className="transition hover:bg-[var(--color-hover)]"
                  >
                    <td>
                      <Link
                        href={`/clients/${client.id}`}
                        className="font-medium hover:text-[var(--color-brand)]"
                      >
                        {client.name}
                      </Link>
                      {client.website ? (
                        <p className="text-[12px] text-[var(--color-muted)]">
                          {client.website}
                        </p>
                      ) : null}
                    </td>
                    <td className="text-[13px]">
                      <p>{client.contactName ?? "—"}</p>
                      <p className="text-[12px] text-[var(--color-muted)]">
                        {[client.email, client.phone]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </p>
                    </td>
                    <td className="text-[13px]">{client._count.projects}</td>
                    <td className="text-[13px]">{client._count.requests}</td>
                    <td className="text-[13px]">
                      {client._count.users > 0 ? (
                        <span className="text-[var(--color-ok)]">
                          {client._count.users} account(s)
                        </span>
                      ) : (
                        <span className="text-[var(--color-muted)]">none</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
