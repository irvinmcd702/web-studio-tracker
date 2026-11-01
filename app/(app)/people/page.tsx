import { redirect } from "next/navigation";
import Link from "next/link";
import { Download, Power } from "lucide-react";

import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { canConfigure } from "@/lib/permissions";
import { toggleUserActiveAction } from "@/app/actions/people";
import { roleLabels } from "@/lib/labels";
import { Avatar, Badge, Card, PageHeader } from "@/components/ui/primitives";
import {
  CreateUserButton,
  EditUserButton,
  ResetLinkButton,
} from "@/components/people/user-forms";
import { ErasePerson } from "@/components/people/erase-person";

const roleColors: Record<string, string> = {
  ADMIN: "#dc2626",
  MANAGER: "#7c3aed",
  MEMBER: "#2563eb",
  CLIENT: "#0891b2",
};

export default async function PeoplePage() {
  const currentUser = await requireStaff();
  if (!canConfigure(currentUser)) redirect("/dashboard");

  const users = await prisma.user.findMany({
    orderBy: [{ isActive: "desc" }, { role: "asc" }, { name: "asc" }],
    include: {
      client: true,
      teamMemberships: { include: { team: true } },
      _count: { select: { assignedTickets: true } },
    },
  });

  const staff = users.filter((u) => u.role !== "CLIENT");
  const clients = users.filter((u) => u.role === "CLIENT");

  // Answering a subject-access request is a manager's job; erasing an account
  // for good is not, so it sits with whoever answers for the studio's records.
  const canErase = currentUser.role === "ADMIN";

  return (
    <>
      <PageHeader
        title="People"
        description={`${staff.length} in the studio · ${clients.length} external user(s)`}
        action={<CreateUserButton />}
      />

      <Card className="mb-6 overflow-hidden">
        <div className="overflow-x-auto scroll-thin">
          <table className="table-base min-w-[820px]">
            <thead>
              <tr>
                <th>Person</th>
                <th className="w-44">Role</th>
                <th>Teams</th>
                <th className="w-28">Tasks</th>
                <th className="w-28"></th>
              </tr>
            </thead>
            <tbody>
              {staff.map((user) => (
                <tr key={user.id} className={user.isActive ? "" : "opacity-50"}>
                  <td>
                    <span className="flex items-center gap-3">
                      <Avatar
                        name={user.name}
                        color={user.avatarColor}
                        size={32}
                      />
                      <span>
                        <span className="block text-[13.5px] font-medium">
                          {user.name}
                          {user.id === currentUser.id ? (
                            <span className="ml-1.5 text-[11.5px] text-[var(--color-muted)]">
                              (you)
                            </span>
                          ) : null}
                        </span>
                        <span className="block text-[12px] text-[var(--color-muted)]">
                          {user.email}
                          {user.position ? ` · ${user.position}` : ""}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td>
                    <Badge color={roleColors[user.role]}>
                      {roleLabels[user.role]}
                    </Badge>
                  </td>
                  <td>
                    <span className="flex flex-wrap gap-1">
                      {user.teamMemberships.length === 0 ? (
                        <span className="text-[13px] text-[var(--color-muted)]">
                          —
                        </span>
                      ) : (
                        user.teamMemberships.map((m) => (
                          <Badge key={m.id} color={m.team.color}>
                            {m.team.name}
                          </Badge>
                        ))
                      )}
                    </span>
                  </td>
                  <td className="text-[13px]">{user._count.assignedTickets}</td>
                  <td>
                    <span className="flex items-center justify-end gap-0.5">
                      <EditUserButton
                        user={{
                          id: user.id,
                          name: user.name,
                          position: user.position,
                          handle: user.handle,
                          gitLogin: user.gitLogin,
                          weeklyCapacity: user.weeklyCapacity,
                          role: user.role,
                        }}
                      />
                      <ResetLinkButton userId={user.id} name={user.name} />
                      <a
                        href={`/api/people/${user.id}/export`}
                        title={`Download everything held about ${user.name}`}
                        className="rounded-md p-1.5 text-[var(--color-muted)] transition hover:bg-[var(--color-hover-strong)] hover:text-[var(--color-ink)]"
                      >
                        <Download size={14} />
                      </a>
                      {user.id !== currentUser.id ? (
                        <form action={toggleUserActiveAction}>
                          <input type="hidden" name="id" value={user.id} />
                          <button
                            type="submit"
                            title={user.isActive ? "Deactivate" : "Activate"}
                            className="rounded-md p-1.5 text-[var(--color-muted)] transition hover:bg-[var(--color-hover-strong)] hover:text-[var(--color-ink)]"
                          >
                            <Power size={14} />
                          </button>
                        </form>
                      ) : null}
                      {canErase && user.id !== currentUser.id ? (
                        <ErasePerson
                          id={user.id}
                          name={user.name}
                          email={user.email}
                        />
                      ) : null}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {clients.length > 0 ? (
        <Card className="overflow-hidden">
          <div className="border-b border-[var(--color-line)] px-5 py-4">
            <h2 className="text-[15px] font-semibold">Client users</h2>
            <p className="mt-0.5 text-[13px] text-[var(--color-muted)]">
              External accounts limited to their own projects
            </p>
          </div>
          <table className="table-base">
            <tbody>
              {clients.map((user) => (
                <tr key={user.id} className={user.isActive ? "" : "opacity-50"}>
                  <td>
                    <span className="flex items-center gap-3">
                      <Avatar
                        name={user.name}
                        color={user.avatarColor}
                        size={28}
                      />
                      <span>
                        <span className="block text-[13.5px] font-medium">
                          {user.name}
                        </span>
                        <span className="block text-[12px] text-[var(--color-muted)]">
                          {user.email}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td className="text-[13px]">
                    {user.client ? (
                      <Link
                        href={`/clients/${user.client.id}`}
                        className="hover:underline"
                      >
                        {user.client.name}
                      </Link>
                    ) : (
                      <span className="text-[var(--color-warn)]">
                        no company
                      </span>
                    )}
                  </td>
                  <td className="w-28">
                    <span className="flex items-center justify-end gap-0.5">
                      <ResetLinkButton userId={user.id} name={user.name} />
                      <a
                        href={`/api/people/${user.id}/export`}
                        title={`Download everything held about ${user.name}`}
                        className="rounded-md p-1.5 text-[var(--color-muted)] transition hover:bg-[var(--color-hover-strong)] hover:text-[var(--color-ink)]"
                      >
                        <Download size={14} />
                      </a>
                      <form action={toggleUserActiveAction}>
                        <input type="hidden" name="id" value={user.id} />
                        <button
                          type="submit"
                          title={user.isActive ? "Deactivate" : "Activate"}
                          className="rounded-md p-1.5 text-[var(--color-muted)] transition hover:bg-[var(--color-hover-strong)] hover:text-[var(--color-ink)]"
                        >
                          <Power size={14} />
                        </button>
                      </form>
                      {canErase ? (
                        <ErasePerson
                          id={user.id}
                          name={user.name}
                          email={user.email}
                        />
                      ) : null}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
    </>
  );
}
