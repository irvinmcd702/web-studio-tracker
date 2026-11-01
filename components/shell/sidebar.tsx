"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  CalendarClock,
  FileBarChart,
  Copy,
  Gauge,
  FileText,
  FolderKanban,
  GitBranch,
  Inbox,
  LifeBuoy,
  LayoutDashboard,
  ListChecks,
  Send,
  Settings,
  Users,
  UserCog,
} from "lucide-react";

import { cn } from "@/lib/utils";

type Item = {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  badge?: number;
  adminOnly?: boolean;
  /** Absent unless the studio has switched the feature on. */
  outreachOnly?: boolean;
};

const items: Item[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/my-tasks", label: "My tasks", icon: ListChecks },
  { href: "/timesheet", label: "Timesheet", icon: CalendarClock },
  { href: "/docs", label: "Docs", icon: FileText },
  { href: "/help", label: "How this works", icon: LifeBuoy },
  { href: "/requests", label: "Requests", icon: Inbox },
  { href: "/workload", label: "Workload", icon: Gauge, adminOnly: true },
  { href: "/templates", label: "Templates", icon: Copy, adminOnly: true },
  { href: "/reports", label: "Reports", icon: FileBarChart, adminOnly: true },
  { href: "/clients", label: "Clients", icon: Building2, adminOnly: true },
  {
    href: "/outreach",
    label: "Outreach",
    icon: Send,
    adminOnly: true,
    outreachOnly: true,
  },
  { href: "/teams", label: "Teams", icon: Users, adminOnly: true },
  { href: "/workflows", label: "Workflows", icon: GitBranch, adminOnly: true },
  { href: "/people", label: "People", icon: UserCog, adminOnly: true },
  { href: "/settings", label: "Settings", icon: Settings, adminOnly: true },
];

export function SidebarNav({
  canConfigure,
  badges = {},
  outreachEnabled = false,
  horizontal = false,
}: {
  canConfigure: boolean;
  /**
   * Counts by href. Generalised from a single `requestCount` prop once a
   * second item wanted one: a nav that hard-codes which link may carry a
   * number needs editing in two places every time a third does.
   */
  badges?: Record<string, number>;
  outreachEnabled?: boolean;
  /** Mobile top bar renders the same items in a scrollable row. */
  horizontal?: boolean;
}) {
  const pathname = usePathname();

  return (
    <nav className={horizontal ? "flex gap-1" : "space-y-0.5"}>
      {items
        .filter((item) => canConfigure || !item.adminOnly)
        .filter((item) => outreachEnabled || !item.outreachOnly)
        .map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          const badge = badges[item.href] ?? 0;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-[var(--radius-field)] px-2.5 py-[7px] text-[13.5px]",
                "transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)]",
                horizontal && "shrink-0 whitespace-nowrap",
                active
                  ? "bg-[var(--color-surface)] font-medium text-[var(--color-ink)] shadow-[inset_0_0_0_1px_var(--color-line)]"
                  : "text-[var(--color-ink-2)] hover:bg-[var(--color-hover)] hover:text-[var(--color-ink)]",
              )}
            >
              <Icon
                size={16}
                className={cn(
                  "shrink-0",
                  active
                    ? "text-[var(--color-brand)]"
                    : "text-[var(--color-faint)]",
                )}
              />
              <span className="flex-1">{item.label}</span>
              {badge > 0 ? (
                <span className="num rounded-full bg-[var(--color-danger)] px-1.5 py-0.5 text-[11px] font-semibold leading-none text-[var(--color-on-danger)]">
                  {badge}
                </span>
              ) : null}
            </Link>
          );
        })}
    </nav>
  );
}
