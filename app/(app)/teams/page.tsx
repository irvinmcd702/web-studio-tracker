import Link from "next/link";
import { redirect } from "next/navigation";
import { Users } from "lucide-react";

import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { canConfigure } from "@/lib/permissions";
import {
  Avatar,
  Badge,
  Card,
  EmptyState,
  PageHeader,
} from "@/components/ui/primitives";
import { CreateTeamButton } from "@/components/team/create-team-button";

export default async function TeamsPage() {
  const user = await requireStaff();
  if (!canConfigure(user)) redirect("/dashboard");

  const [teams, people] = await Promise.all([
    prisma.team.findMany({
      where: { isArchived: false },
      orderBy: { name: "asc" },
      include: {
        members: {
          include: {
            user: { include: { projectRoles: { include: { project: true } } } },
          },
        },
      },
    }),
    prisma.user.findMany({
      where: { isActive: true, role: { in: ["ADMIN", "MANAGER", "MEMBER"] } },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Teams"
        description="Who does what in the studio — the pool you pick project crews from"
        action={
          <CreateTeamButton
            people={people.map((p) => ({
              id: p.id,
              name: p.name,
              extra: p.position ?? undefined,
            }))}
          />
        }
      />

      {teams.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users size={30} />}
            title="No teams yet"
            description="Create a team — Frontend or Design, say — to pick project crews from it faster."
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {teams.map((team) => (
            <Link
              key={team.id}
              href={`/teams/${team.id}`}
              className="card p-5 transition hover:border-[var(--color-line-strong)] hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: team.color }}
                    />
                    <h3 className="truncate text-[15px] font-semibold">
                      {team.name}
                    </h3>
                  </div>
                  {team.description ? (
                    <p className="mt-1 line-clamp-2 text-[13px] text-[var(--color-muted)]">
                      {team.description}
                    </p>
                  ) : null}
                </div>
                <Badge color={team.color}>{team.members.length} people</Badge>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-1">
                {team.members.slice(0, 8).map((member) => (
                  <Avatar
                    key={member.id}
                    name={member.user.name}
                    color={member.user.avatarColor}
                    size={28}
                  />
                ))}
                {team.members.length > 8 ? (
                  <span className="text-[12px] text-[var(--color-muted)]">
                    +{team.members.length - 8}
                  </span>
                ) : null}
                {team.members.length === 0 ? (
                  <span className="text-[12.5px] text-[var(--color-muted)]">
                    No members
                  </span>
                ) : null}
              </div>

              <p className="mt-4 border-t border-[var(--color-line)] pt-3 text-[12.5px] text-[var(--color-muted)]">
                {(() => {
                  // Where these people actually work right now — projects are
                  // crewed person by person, so this is a roll-up, not a link.
                  const keys = [
                    ...new Set(
                      team.members.flatMap((m) =>
                        m.user.projectRoles.map((r) => r.project.key),
                      ),
                    ),
                  ].sort();
                  return keys.length === 0
                    ? "Nobody here is on a project yet"
                    : `Working on: ${keys.join(", ")}`;
                })()}
              </p>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
