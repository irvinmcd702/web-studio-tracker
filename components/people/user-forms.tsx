"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Pencil, Plus } from "lucide-react";

import {
  createResetLinkAction,
  createUserAction,
  updateUserAction,
} from "@/app/actions/people";
import { Modal, useModalClose } from "@/components/ui/modal";
import { buttonClass } from "@/components/ui/button";
import { TokenDelivery } from "@/components/ui/token-delivery";
import {
  Field,
  FormError,
  Input,
  Select,
  SubmitButton,
} from "@/components/ui/form";
import { roleLabels } from "@/lib/labels";

const STAFF_ROLES = ["ADMIN", "MANAGER", "MEMBER"] as const;

export function CreateUserButton() {
  return (
    <Modal
      title="Invite a person"
      description="They pick their own password through a one-time link"
      trigger={
        <span className="inline-flex items-center gap-1.5">
          <Plus size={15} />
          Invite person
        </span>
      }
    >
      <CreateUserForm />
    </Modal>
  );
}

function CreateUserForm() {
  const [state, action] = useActionState(createUserAction, null);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  if (state?.ok) {
    return (
      <div className="space-y-4">
        <TokenDelivery
          emailed={state.emailed}
          link={state.link}
          expiresAt={state.expiresAt}
          note={
            state.emailed ? state.note : `Account created. ${state.note ?? ""}`
          }
        />
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <FormError message={state?.error} />

      <Field label="Name" required>
        <Input name="name" placeholder="Anna Novak" required />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email" required>
          <Input
            name="email"
            type="email"
            placeholder="anna@studio.com"
            required
          />
        </Field>
        <Field label="Job title">
          <Input name="position" placeholder="Frontend developer" />
        </Field>
      </div>

      <Field
        label="Git username"
        hint="GitHub or GitLab login. Pull requests carry only a username, so without it their PRs cannot be matched to this person."
      >
        <Input name="gitLogin" placeholder="anna-dev" />
      </Field>

      <Field label="Role">
        <Select name="role" defaultValue="MEMBER">
          {STAFF_ROLES.map((role) => (
            <option key={role} value={role}>
              {roleLabels[role]}
            </option>
          ))}
        </Select>
      </Field>

      <div className="flex justify-end border-t border-[var(--color-line)] pt-4">
        <SubmitButton>Create invite</SubmitButton>
      </div>
    </form>
  );
}

export function EditUserButton({
  user,
}: {
  user: {
    id: string;
    name: string;
    position: string | null;
    handle: string;
    gitLogin: string | null;
    weeklyCapacity: number;
    role: string;
  };
}) {
  return (
    <Modal
      title="Edit person"
      triggerLabel="Edit this person"
      triggerClassName="rounded-md p-1.5 text-[var(--color-muted)] transition hover:bg-[var(--color-hover-strong)] hover:text-[var(--color-ink)]"
      trigger={<Pencil size={14} />}
    >
      <EditUserForm user={user} />
    </Modal>
  );
}

function EditUserForm({
  user,
}: {
  user: {
    id: string;
    name: string;
    position: string | null;
    handle: string;
    gitLogin: string | null;
    weeklyCapacity: number;
    role: string;
  };
}) {
  const [state, action] = useActionState(updateUserAction, null);
  const close = useModalClose();
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
      close();
    }
  }, [state, close, router]);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={user.id} />
      <FormError message={state?.error} />

      <Field label="Name" required>
        <Input name="name" defaultValue={user.name} required />
      </Field>

      <Field label="Job title">
        <Input name="position" defaultValue={user.position ?? ""} />
      </Field>

      <Field
        label="Handle"
        hint="What people type after an @ to mention them. Lowercase, and unique across the studio."
      >
        <Input
          name="handle"
          defaultValue={user.handle}
          spellCheck={false}
          className="font-mono text-[13px]"
        />
      </Field>

      <Field
        label="Git username"
        hint="GitHub or GitLab login, so their pull requests find this account"
      >
        <Input name="gitLogin" defaultValue={user.gitLogin ?? ""} />
      </Field>

      <Field
        label="Hours in a normal week"
        hint="Only decides when Workload shows their week as over-committed. Nothing is measured against it."
      >
        <Input
          type="number"
          name="weeklyCapacity"
          min={0}
          max={80}
          step={1}
          defaultValue={String(user.weeklyCapacity ?? 40)}
          className="num w-24"
        />
      </Field>

      <Field label="Role">
        <Select name="role" defaultValue={user.role}>
          {(user.role === "CLIENT"
            ? ["CLIENT", ...STAFF_ROLES]
            : STAFF_ROLES
          ).map((role) => (
            <option key={role} value={role}>
              {roleLabels[role]}
            </option>
          ))}
        </Select>
      </Field>

      <div className="flex justify-end border-t border-[var(--color-line)] pt-4">
        <SubmitButton>Save</SubmitButton>
      </div>
    </form>
  );
}

export function ResetLinkButton({
  userId,
  name,
}: {
  userId: string;
  name: string;
}) {
  return (
    <Modal
      title="Password link"
      description={`Issue a one-time link for ${name}`}
      triggerLabel="Create a password reset link"
      triggerClassName={buttonClass("ghost", "sm")}
      trigger={<KeyRound size={14} />}
    >
      <ResetLinkForm userId={userId} />
    </Modal>
  );
}

function ResetLinkForm({ userId }: { userId: string }) {
  const [state, action] = useActionState(createResetLinkAction, null);

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
      <input type="hidden" name="id" value={userId} />
      <FormError message={state?.error} />

      <p className="text-[13px] text-[var(--color-muted)]">
        Generating a link invalidates any previous one. You never see their
        password — they choose it themselves, and every other session on that
        account is signed out when they do.
      </p>

      <div className="flex justify-end border-t border-[var(--color-line)] pt-4">
        <SubmitButton>Generate link</SubmitButton>
      </div>
    </form>
  );
}
