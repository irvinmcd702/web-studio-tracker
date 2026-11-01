import Link from "next/link";

import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { canConfigure } from "@/lib/permissions";
import { SidebarNav } from "@/components/shell/sidebar";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { UserMenu } from "@/components/shell/user-menu";
import { RunningTimerBadge } from "@/components/shell/running-timer";
import {
  CommandPalette,
  CommandPaletteTrigger,
} from "@/components/shell/command-palette";
import { ticketKey } from "@/lib/utils";
import { getStudioSettings } from "@/lib/settings";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireStaff();

  const [newRequests, timer, settings, waitingApproval] = await Promise.all([
    prisma.clientRequest.count({
      where: { status: { in: ["NEW", "IN_REVIEW"] } },
    }),
    prisma.runningTimer.findUnique({
      where: { userId: user.id },
      include: { ticket: { include: { project: true } } },
    }),
    getStudioSettings(),
    // First messages nobody has read yet. Counted here rather than on the
    // outreach page because the badge is what tells somebody to go there.
    prisma.campaignEnrolment.count({ where: { status: "AWAITING_APPROVAL" } }),
  ]);

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 py-4 lg:flex">
        <Link href="/dashboard" className="mb-5 flex items-center gap-2.5 px-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-brand)] text-sm font-bold text-[var(--color-on-brand)]">
            S
          </span>
          <span className="text-[15px] font-semibold tracking-tight">
            Studio Tracker
          </span>
        </Link>

        <CommandPaletteTrigger />

        <div className="flex-1 overflow-y-auto scroll-thin">
          <SidebarNav
            canConfigure={canConfigure(user)}
            badges={{
              "/requests": newRequests,
              "/outreach": waitingApproval,
            }}
            outreachEnabled={settings.outreachEnabled}
          />
        </div>

        <div className="mt-3 space-y-2 border-t border-[var(--color-line)] pt-3">
          {timer ? (
            <RunningTimerBadge
              ticketId={timer.ticketId}
              ticketKey={ticketKey(
                timer.ticket.project.key,
                timer.ticket.number,
              )}
              title={timer.ticket.title}
              startedAt={timer.startedAt.toISOString()}
            />
          ) : null}
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <UserMenu
                id={user.id}
                name={user.name}
                email={user.email}
                role={user.role}
                color={user.avatarColor}
              />
            </div>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-[var(--color-line)] bg-[var(--color-surface-2)] px-4 py-3 lg:hidden">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--color-brand)] text-xs font-bold text-[var(--color-on-brand)]">
              S
            </span>
            <span className="text-sm font-semibold">Studio Tracker</span>
          </Link>
          <div className="w-40">
            <UserMenu
              id={user.id}
              name={user.name}
              email={user.email}
              role={user.role}
              color={user.avatarColor}
            />
          </div>
        </header>

        <div className="overflow-x-auto border-b border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 py-2 scroll-thin lg:hidden">
          <SidebarNav
            horizontal
            canConfigure={canConfigure(user)}
            badges={{
              "/requests": newRequests,
              "/outreach": waitingApproval,
            }}
            outreachEnabled={settings.outreachEnabled}
          />
        </div>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>

      <CommandPalette canConfigure={canConfigure(user)} />
    </div>
  );
}
