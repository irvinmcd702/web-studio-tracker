"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Download, KeyRound, LogOut } from "lucide-react";

import { logoutAction } from "@/app/actions/auth";
import { Avatar } from "@/components/ui/primitives";

const roleLabels: Record<string, string> = {
  ADMIN: "Administrator",
  MANAGER: "Project manager",
  MEMBER: "Team member",
  CLIENT: "Client",
};

export function UserMenu({
  id,
  name,
  email,
  role,
  color,
}: {
  id: string;
  name: string;
  email: string;
  role: string;
  color: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition hover:bg-[var(--color-hover-strong)]"
      >
        <Avatar name={name} color={color} size={28} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">{name}</span>
          <span className="block truncate text-[11.5px] text-[var(--color-muted)]">
            {roleLabels[role] ?? role}
          </span>
        </span>
      </button>

      {open ? (
        <div className="absolute bottom-full left-0 z-30 mb-2 w-full min-w-[200px] rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-1 shadow-lg">
          <div className="px-3 py-2">
            <p className="truncate text-[13px] font-medium">{name}</p>
            <p className="truncate text-[12px] text-[var(--color-muted)]">
              {email}
            </p>
          </div>
          <div className="my-1 border-t border-[var(--color-line)]" />
          <Link
            href="/tokens"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-[13px] text-[var(--color-ink-2)] transition hover:bg-[var(--color-hover-strong)] hover:text-[var(--color-ink)]"
          >
            <KeyRound size={15} />
            API tokens
          </Link>
          {/* Nobody should have to ask an administrator what is held about
              them. It is a plain link because it is a plain right. */}
          <a
            href={`/api/people/${id}/export`}
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-[13px] text-[var(--color-ink-2)] transition hover:bg-[var(--color-hover-strong)] hover:text-[var(--color-ink)]"
          >
            <Download size={15} />
            Download my data
          </a>
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-[13px] text-[var(--color-ink-2)] transition hover:bg-[var(--color-hover-strong)] hover:text-[var(--color-ink)]"
            >
              <LogOut size={15} />
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
