"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Send, UserPlus } from "lucide-react";

import {
  inviteClientUserAction,
  reinviteClientUserAction,
} from "@/app/actions/clients";
import { Modal } from "@/components/ui/modal";
import { buttonClass } from "@/components/ui/button";
import { TokenDelivery } from "@/components/ui/token-delivery";
import { Field, FormError, Input, SubmitButton } from "@/components/ui/form";

export function InviteClientUserButton({ clientId }: { clientId: string }) {
  return (
    <Modal
      title="Invite to the portal"
      description="The client sets their own password — no password is sent by hand"
      triggerClassName={buttonClass("secondary", "sm")}
      trigger={
        <span className="inline-flex items-center gap-1.5">
          <UserPlus size={14} />
          Invite
        </span>
      }
    >
      <InviteForm clientId={clientId} />
    </Modal>
  );
}

function InviteForm({ clientId }: { clientId: string }) {
  const [state, action] = useActionState(inviteClientUserAction, null);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  if (state?.ok) {
    return (
      <TokenDelivery
        emailed={state.emailed}
        link={state.link}
        expiresAt={state.expiresAt}
        note={
          state.emailed ? state.note : `Invite created. ${state.note ?? ""}`
        }
      />
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="clientId" value={clientId} />
      <FormError message={state?.error} />

      <Field label="Name" required>
        <Input name="name" placeholder="John Carter" required />
      </Field>

      <Field label="Email" required>
        <Input name="email" type="email" placeholder="john@acme.com" required />
      </Field>

      <div className="flex justify-end border-t border-[var(--color-line)] pt-4">
        <SubmitButton>Create invite</SubmitButton>
      </div>
    </form>
  );
}

export function ResendInviteButton({
  userId,
  name,
  pending,
}: {
  userId: string;
  name: string;
  /** True while the invite has not been used yet. */
  pending: boolean;
}) {
  return (
    <Modal
      title={pending ? "Resend the invite" : "Password link"}
      description={`Issue a fresh one-time link for ${name}`}
      triggerClassName={buttonClass("ghost", "sm")}
      triggerLabel={pending ? `Resend the invite to ${name}` : `Issue a password link for ${name}`}
      trigger={<Send size={14} />}
    >
      <ResendForm userId={userId} />
    </Modal>
  );
}

function ResendForm({ userId }: { userId: string }) {
  const [state, action] = useActionState(reinviteClientUserAction, null);

  if (state?.ok) {
    return (
      <TokenDelivery
        emailed={state.emailed}
        link={state.link}
        expiresAt={state.expiresAt}
        note={state.note}
      />
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="userId" value={userId} />
      <FormError message={state?.error} />

      <p className="text-[13px] text-[var(--color-muted)]">
        The previous link stops working as soon as a new one is generated.
      </p>

      <div className="flex justify-end border-t border-[var(--color-line)] pt-4">
        <SubmitButton>Generate link</SubmitButton>
      </div>
    </form>
  );
}
