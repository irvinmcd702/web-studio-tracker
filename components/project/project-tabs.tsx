"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export function ProjectTabs({
  projectId,
  canEdit,
  unreadChat,
  pendingApprovals = 0,
}: {
  projectId: string;
  canEdit: boolean;
  unreadChat: number;
  pendingApprovals?: number;
}) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;

  const tabs = [
    { href: base, label: "Overview", exact: true },
    { href: `${base}/board`, label: "Board" },
    { href: `${base}/tickets`, label: "Tickets" },
    { href: `${base}/chat`, label: "Client chat", badge: unreadChat },
    { href: `${base}/approvals`, label: "Approvals", badge: pendingApprovals },
    { href: `${base}/meetings`, label: "Meetings" },
    { href: `${base}/docs`, label: "Docs" },
    { href: `${base}/files`, label: "Files" },
    { href: `${base}/budget`, label: "Budget" },
    ...(canEdit ? [{ href: `${base}/settings`, label: "Settings" }] : []),
  ];

  return (
    <div className="-mb-px flex gap-1 overflow-x-auto scroll-thin">
      {tabs.map((tab) => {
        const active = tab.exact
          ? pathname === tab.href
          : pathname === tab.href || pathname.startsWith(`${tab.href}/`);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-[13.5px] font-medium transition",
              active
                ? "border-[var(--color-brand)] text-[var(--color-brand)]"
                : "border-transparent text-[var(--color-ink-2)] hover:border-[var(--color-line-strong)] hover:text-[var(--color-ink)]",
            )}
          >
            {tab.label}
            {tab.badge ? (
              <span className="rounded-full bg-[var(--color-danger)] px-1.5 py-0.5 text-[11px] font-semibold leading-none text-[var(--color-on-danger)]">
                {tab.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
