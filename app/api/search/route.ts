import type { NextRequest } from "next/server";

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canConfigure, projectScope } from "@/lib/permissions";
import { docScope } from "@/lib/docs";
import { ticketKey } from "@/lib/utils";

/**
 * Backing search for the command palette.
 *
 * Everything here runs through the same `projectScope` the pages use — a
 * search box that ignored permissions would be the easiest way to leak one
 * client's work to another.
 */

export type SearchItem = {
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  badge?: string;
  color?: string;
};

export type SearchGroup = {
  id: string;
  label: string;
  items: SearchItem[];
};

const PER_GROUP = 6;

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  // The palette is a staff tool; the client portal has its own small surface.
  if (user.role === "CLIENT") return new Response("Forbidden", { status: 403 });

  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  const scope = projectScope(user);
  const groups: SearchGroup[] = [];

  // Empty query: offer somewhere useful to land rather than a blank list.
  if (!q) {
    const [recent, mine] = await Promise.all([
      prisma.project.findMany({
        where: { AND: [scope, { status: { in: ["ACTIVE", "ON_HOLD"] } }] },
        orderBy: { updatedAt: "desc" },
        take: 5,
        include: { client: true },
      }),
      prisma.ticket.findMany({
        where: {
          assigneeId: user.id,
          status: { category: { not: "DONE" } },
        },
        orderBy: { updatedAt: "desc" },
        take: 5,
        include: { project: true, status: true },
      }),
    ]);

    if (mine.length) {
      groups.push({
        id: "mine",
        label: "Assigned to you",
        items: mine.map((t) => ({
          id: t.id,
          title: t.title,
          subtitle: `${ticketKey(t.project.key, t.number)} · ${t.project.name}`,
          href: `/tickets/${t.id}`,
          badge: t.status.name,
          color: t.status.color,
        })),
      });
    }

    if (recent.length) {
      groups.push({
        id: "projects",
        label: "Recent projects",
        items: recent.map((p) => ({
          id: p.id,
          title: p.name,
          subtitle: p.client?.name ?? "Internal project",
          href: `/projects/${p.id}`,
          badge: p.key,
        })),
      });
    }

    return Response.json({ groups });
  }

  const like = { contains: q, mode: "insensitive" as const };

  // "ACME-14" or "acme 14" should jump straight to that ticket.
  const keyMatch = /^([a-z][a-z0-9]*)[\s-]*(\d+)$/i.exec(q);

  const [byKey, projects, tickets] = await Promise.all([
    keyMatch
      ? prisma.ticket.findMany({
          where: {
            AND: [
              { project: scope },
              {
                project: { key: { equals: keyMatch[1]!, mode: "insensitive" } },
              },
              { number: Number(keyMatch[2]) },
            ],
          },
          take: 1,
          include: { project: true, status: true },
        })
      : Promise.resolve([]),
    prisma.project.findMany({
      where: { AND: [scope, { OR: [{ name: like }, { key: like }] }] },
      orderBy: { updatedAt: "desc" },
      take: PER_GROUP,
      include: { client: true },
    }),
    prisma.ticket.findMany({
      where: {
        AND: [
          { project: scope },
          { OR: [{ title: like }, { description: like }] },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: PER_GROUP,
      include: { project: true, status: true },
    }),
  ]);

  const exact = byKey[0];
  if (exact) {
    groups.push({
      id: "exact",
      label: "Exact match",
      items: [
        {
          id: exact.id,
          title: exact.title,
          subtitle: `${ticketKey(exact.project.key, exact.number)} · ${exact.project.name}`,
          href: `/tickets/${exact.id}`,
          badge: exact.status.name,
          color: exact.status.color,
        },
      ],
    });
  }

  if (projects.length) {
    groups.push({
      id: "projects",
      label: "Projects",
      items: projects.map((p) => ({
        id: p.id,
        title: p.name,
        subtitle: p.client?.name ?? "Internal project",
        href: `/projects/${p.id}`,
        badge: p.key,
      })),
    });
  }

  const ticketItems = tickets
    .filter((t) => t.id !== exact?.id)
    .map((t) => ({
      id: t.id,
      title: t.title,
      subtitle: `${ticketKey(t.project.key, t.number)} · ${t.project.name}`,
      href: `/tickets/${t.id}`,
      badge: t.status.name,
      color: t.status.color,
    }));

  if (ticketItems.length) {
    groups.push({ id: "tickets", label: "Tickets", items: ticketItems });
  }

  const docs = await prisma.doc.findMany({
    where: {
      AND: [docScope(user), { OR: [{ title: like }, { body: like }] }],
    },
    orderBy: { updatedAt: "desc" },
    take: PER_GROUP,
    include: { project: true },
  });

  if (docs.length) {
    groups.push({
      id: "docs",
      label: "Docs",
      items: docs.map((d) => ({
        id: d.id,
        title: d.title,
        subtitle: d.project ? d.project.name : "Studio",
        href: `/docs/${d.id}`,
      })),
    });
  }

  // Requests are visible to all staff; the configuration areas are not.
  const requests = await prisma.clientRequest.findMany({
    where: {
      OR: [{ title: like }, { companyName: like }, { contactName: like }],
    },
    orderBy: { createdAt: "desc" },
    take: PER_GROUP,
  });

  if (requests.length) {
    groups.push({
      id: "requests",
      label: "Requests",
      items: requests.map((r) => ({
        id: r.id,
        title: r.title,
        subtitle: r.companyName ?? r.contactName ?? "No company",
        href: `/requests/${r.id}`,
        badge: r.status,
      })),
    });
  }

  if (canConfigure(user)) {
    const [clients, people, teams, workflows] = await Promise.all([
      prisma.client.findMany({
        where: { isArchived: false, name: like },
        orderBy: { name: "asc" },
        take: PER_GROUP,
      }),
      prisma.user.findMany({
        where: { OR: [{ name: like }, { email: like }] },
        orderBy: { name: "asc" },
        take: PER_GROUP,
      }),
      prisma.team.findMany({
        where: { isArchived: false, name: like },
        orderBy: { name: "asc" },
        take: PER_GROUP,
      }),
      prisma.workflow.findMany({
        where: { isArchived: false, name: like },
        orderBy: { name: "asc" },
        take: PER_GROUP,
      }),
    ]);

    if (clients.length) {
      groups.push({
        id: "clients",
        label: "Clients",
        items: clients.map((c) => ({
          id: c.id,
          title: c.name,
          subtitle: c.contactName ?? c.email ?? undefined,
          href: `/clients/${c.id}`,
        })),
      });
    }

    if (people.length) {
      groups.push({
        id: "people",
        label: "People",
        items: people.map((p) => ({
          id: p.id,
          title: p.name,
          subtitle: p.email,
          href: "/people",
          badge: p.role,
          color: p.avatarColor,
        })),
      });
    }

    if (teams.length) {
      groups.push({
        id: "teams",
        label: "Teams",
        items: teams.map((t) => ({
          id: t.id,
          title: t.name,
          subtitle: t.description ?? undefined,
          href: `/teams/${t.id}`,
          color: t.color,
        })),
      });
    }

    if (workflows.length) {
      groups.push({
        id: "workflows",
        label: "Workflows",
        items: workflows.map((w) => ({
          id: w.id,
          title: w.name,
          subtitle: w.description ?? undefined,
          href: `/workflows/${w.id}`,
        })),
      });
    }
  }

  return Response.json({ groups });
}
