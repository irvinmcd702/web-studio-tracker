import Link from "next/link";

import { ThemeToggle } from "@/components/shell/theme-toggle";
import { cn } from "@/lib/utils";

/**
 * The frame around every unauthenticated screen: sign-in, the invite and
 * reset links, and the public request form. It is the first thing both a new
 * developer and a prospective client see, so it stays a tool: a wordmark, one
 * card, and no decoration.
 */
export function AuthFrame({
  title,
  description,
  children,
  footer,
  width = "narrow",
  homeHref = "/",
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: "narrow" | "wide";
  homeHref?: string;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-canvas)]">
      <header className="flex items-center justify-between gap-4 px-5 py-4">
        <Link
          href={homeHref}
          className="flex items-center gap-2.5 rounded-[var(--radius-field)]"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--color-brand)] text-[13px] font-bold text-[var(--color-on-brand)]">
            S
          </span>
          <span className="text-[14px] font-semibold">Studio Tracker</span>
        </Link>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-6 sm:items-center sm:pb-24 sm:pt-0">
        <div
          className={cn(
            "w-full",
            width === "narrow" ? "max-w-[380px]" : "max-w-2xl",
          )}
        >
          <div className="mb-5">
            <h1 className="text-[22px] font-semibold">{title}</h1>
            {description ? (
              <p className="mt-1.5 max-w-[52ch] text-[13.5px] leading-relaxed text-[var(--color-muted)]">
                {description}
              </p>
            ) : null}
          </div>

          <div className="card p-6">{children}</div>

          {footer ? <div className="mt-4">{footer}</div> : null}
        </div>
      </main>
    </div>
  );
}
