import Link from "next/link";

import { isMailConfigured } from "@/lib/mail";
import { AuthFrame } from "@/components/shell/auth-frame";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata = { title: "Reset your password — Studio Tracker" };

export default function ForgotPasswordPage() {
  const canSend = isMailConfigured();

  return (
    <AuthFrame
      title="Reset your password"
      description={
        canSend
          ? "Type the address you sign in with and we'll email you a link. It works once and lasts two hours."
          : "This tracker has no mail server configured, so it cannot send you a link."
      }
      homeHref="/login"
      footer={
        <p className="text-[12.5px] text-[var(--color-muted)]">
          Remembered it?{" "}
          <Link
            href="/login"
            className="font-medium text-[var(--color-brand)] hover:underline"
          >
            Back to sign in
          </Link>
        </p>
      }
    >
      {canSend ? (
        <ForgotPasswordForm />
      ) : (
        <p className="text-[13.5px] leading-relaxed text-[var(--color-ink-2)]">
          Ask an administrator to issue you a new link from the People screen.
          They can hand it over directly.
        </p>
      )}
    </AuthFrame>
  );
}
