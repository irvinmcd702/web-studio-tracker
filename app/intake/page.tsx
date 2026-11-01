import { submitPublicRequestAction } from "@/app/actions/requests";
import { AuthFrame } from "@/components/shell/auth-frame";
import { RequestForm } from "@/components/request/request-form";

export const metadata = {
  title: "Project request — Studio Tracker",
};

export default function IntakePage() {
  return (
    <AuthFrame
      width="wide"
      homeHref="/intake"
      title="Tell us about your project"
      description="A project manager reads every request and comes back with questions and an estimate, usually within a working day."
      footer={
        <p className="text-[12.5px] text-[var(--color-muted)]">
          No account needed. This page is meant to be embedded on the studio
          website.
        </p>
      }
    >
      <RequestForm
        action={submitPublicRequestAction}
        publicMode
        submitLabel="Send request"
      />
    </AuthFrame>
  );
}
