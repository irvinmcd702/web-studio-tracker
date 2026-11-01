import { AuthFrame } from "@/components/shell/auth-frame";
import { buttonClass } from "@/components/ui/button";

/**
 * The way back for somebody whose link no longer verifies.
 *
 * Unsubscribe links are derived from the server's secret rather than stored,
 * which means rotating that secret invalidates every link already sitting in
 * an inbox. This page is the honest half of that trade: it costs one form and
 * it means nobody is ever stuck holding a link that has stopped working.
 */
export const metadata = {
  title: "Unsubscribe — Studio Tracker",
};

export default async function UnsubscribeByAddressPage({
  searchParams,
}: {
  searchParams: Promise<{ problem?: string }>;
}) {
  const { problem } = await searchParams;

  return (
    <AuthFrame
      title="Stop these emails"
      description="Enter the address you were written to and we will take it off the list."
    >
      {problem ? (
        <p
          role="alert"
          className="mb-4 rounded-lg bg-[var(--color-danger-soft)] px-3 py-2 text-[13px] text-[var(--color-danger)]"
        >
          That did not look like an email address. Try again.
        </p>
      ) : null}

      <form method="post" action="/api/outreach/unsubscribe" className="space-y-3">
        <div>
          <label className="label" htmlFor="unsubscribe-email">
            Email address
          </label>
          <input
            id="unsubscribe-email"
            className="field"
            type="email"
            name="email"
            required
            autoComplete="email"
          />
        </div>

        <button type="submit" className={buttonClass("primary", "md")}>
          Unsubscribe
        </button>
      </form>

      <p className="mt-4 text-[12.5px] leading-relaxed text-[var(--color-muted)]">
        We add the address to a suppression list rather than deleting it. That
        is what stops a future list from putting you back.
      </p>
    </AuthFrame>
  );
}
