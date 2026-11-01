import Link from "next/link";

import { lookupAuthToken, TOKEN_ERRORS } from "@/lib/auth-tokens";
import { AuthFrame } from "@/components/shell/auth-frame";
import { SetPasswordForm } from "./set-password-form";

export const metadata = {
  title: "Set your password — Studio Tracker",
};

export default async function SetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const lookup = await lookupAuthToken(token);

  const title = !lookup.ok
    ? "This link no longer works"
    : lookup.kind === "INVITE"
      ? "Welcome aboard"
      : "Set a new password";

  const description = lookup.ok
    ? lookup.kind === "INVITE"
      ? `Pick a password for ${lookup.user.email}. Nobody at the studio ever sees it.`
      : `Choose a new password for ${lookup.user.email}.`
    : undefined;

  return (
    <AuthFrame
      title={title}
      description={description}
      homeHref="/login"
      footer={
        lookup.ok ? (
          <p className="text-[12px] text-[var(--color-muted)]">
            Setting a password signs out every other device on this account.
          </p>
        ) : null
      }
    >
      {lookup.ok ? (
        <SetPasswordForm token={token} />
      ) : (
        <div className="space-y-3">
          <p className="rounded-[var(--radius-field)] border border-[var(--color-danger-line)] bg-[var(--color-danger-soft)] px-3 py-2 text-[13px] text-[var(--color-danger)]">
            {TOKEN_ERRORS[lookup.reason]}
          </p>
          <Link
            href="/login"
            className="inline-block text-[13px] font-medium text-[var(--color-brand)] hover:underline"
          >
            Back to sign in
          </Link>
        </div>
      )}
    </AuthFrame>
  );
}
