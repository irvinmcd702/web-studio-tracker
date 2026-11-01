import { prisma } from "./db";
import type { CrewPerson } from "@/components/project/crew-picker";

/**
 * Every staff account that can be put on a project crew, with the standing
 * teams they belong to so the picker can offer "add everyone from Backend".
 */
export async function staffForCrew(): Promise<CrewPerson[]> {
  const staff = await prisma.user.findMany({
    where: { isActive: true, role: { in: ["ADMIN", "MANAGER", "MEMBER"] } },
    orderBy: { name: "asc" },
    include: { teamMemberships: { include: { team: true } } },
  });

  return staff.map((person) => ({
    id: person.id,
    name: person.name,
    position: person.position,
    avatarColor: person.avatarColor,
    teams: person.teamMemberships
      .filter((m) => !m.team.isArchived)
      .map((m) => m.team.name),
  }));
}

/**
 * People who can be assigned tickets on a project: its crew, plus the project
 * manager. Falls back to all active staff while the crew is still empty, so a
 * fresh project is usable before anyone gets round to picking the team.
 */
export async function projectAssignees(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      manager: true,
      members: { include: { user: true } },
    },
  });
  if (!project) return [];

  const map = new Map<string, { id: string; name: string; extra?: string }>();

  for (const member of project.members) {
    if (!member.user.isActive) continue;
    map.set(member.user.id, {
      id: member.user.id,
      name: member.user.name,
      extra: member.role ?? member.user.position ?? undefined,
    });
  }

  if (project.manager?.isActive) {
    map.set(project.manager.id, {
      id: project.manager.id,
      name: project.manager.name,
      extra: "PM",
    });
  }

  if (map.size === 0) {
    const staff = await prisma.user.findMany({
      where: { isActive: true, role: { in: ["ADMIN", "MANAGER", "MEMBER"] } },
      orderBy: { name: "asc" },
    });
    for (const user of staff) {
      map.set(user.id, {
        id: user.id,
        name: user.name,
        extra: user.position ?? undefined,
      });
    }
  }

  return [...map.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "en-US"),
  );
}
