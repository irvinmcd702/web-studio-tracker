import { AuthFrame } from "@/components/shell/auth-frame";

export const metadata = {
  title: "Unsubscribed — Studio Tracker",
};

export default function UnsubscribedPage() {
  return (
    <AuthFrame
      title="You are unsubscribed"
      description="Nothing further will be sent to that address."
    >
      <p className="text-[13.5px] leading-relaxed text-[var(--color-muted)]">
        The address is on our suppression list. It stays there even if the rest
        of the record is deleted, so a list imported later cannot add you back.
      </p>
    </AuthFrame>
  );
}
