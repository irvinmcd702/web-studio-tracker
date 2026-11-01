import Link from "next/link";

import { getCurrentUser } from "@/lib/auth";
import { buttonClass } from "@/components/ui/button";

/**
 * A missing page is usually a stale link or something the person is not
 * allowed to see: `notFound()` is what every permission check raises. Say both
 * and point somewhere useful rather than showing a dead end.
 */
export default async function NotFound() {
  const user = await getCurrentUser();
  const home = !user
    ? "/login"
    : user.role === "CLIENT"
      ? "/portal"
      : "/dashboard";

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-canvas)] px-4">
      <div className="w-full max-w-md text-center">
        <p className="num text-[13px] font-medium tracking-wide text-[var(--color-muted)]">
          404
        </p>
        <h1 className="mt-2 text-[22px] font-semibold">
          This page isn&apos;t here
        </h1>
        <p className="mx-auto mt-2 max-w-[46ch] text-[13.5px] leading-relaxed text-[var(--color-muted)]">
          The link may be out of date, the item may have been deleted, or it may
          belong to a project you don&apos;t have access to.
        </p>
        <div className="mt-5 flex items-center justify-center gap-2">
          <Link href={home} className={buttonClass("primary", "md")}>
            {user ? "Back to your work" : "Sign in"}
          </Link>
        </div>
      </div>
    </div>
  );
}
