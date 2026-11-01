import Link from "next/link";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logoutAction } from "@/app/actions/auth";
import { Avatar } from "@/components/ui/primitives";
import { ThemeToggle } from "@/components/shell/theme-toggle";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  if (user.role !== "CLIENT") redirect("/dashboard");

  const client = user.clientId
    ? await prisma.client.findUnique({ where: { id: user.clientId } })
    : null;

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--color-line)] bg-[var(--color-surface)]">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/portal" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-brand)] text-sm font-bold text-[var(--color-on-brand)]">
              S
            </span>
            <span>
              <span className="block text-[14px] font-semibold leading-tight">
                Client portal
              </span>
              <span className="block text-[12px] text-[var(--color-muted)]">
                {client?.name ?? "Studio Tracker"}
              </span>
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <span className="hidden items-center gap-2 text-[13px] sm:flex">
              <Avatar name={user.name} color={user.avatarColor} size={28} />
              {user.name}
            </span>
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-[13px] font-medium transition hover:bg-[var(--color-hover)]"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">{children}</main>

      {/* Findable without being asked for: a notice nobody can reach is not a
          notice. It sits in the footer because that is where people look. */}
      <footer className="mx-auto max-w-5xl px-4 pb-8 sm:px-6">
        <div className="border-t border-[var(--color-line)] pt-4 text-[12.5px] text-[var(--color-muted)]">
          <Link
            href="/portal/privacy"
            className="font-medium hover:text-[var(--color-ink)] hover:underline"
          >
            Your data
          </Link>
          <span>
            {" "}
            — what is held about you, who else sees it, and how to get a copy.
          </span>
        </div>
      </footer>
    </div>
  );
}
