"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";

import { Button, type ButtonProps } from "./button";
import { cn } from "@/lib/utils";

export type ActionState = { error?: string; ok?: boolean } | null;

export function SubmitButton({
  children,
  pendingText,
  ...props
}: ButtonProps & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} {...props}>
      {pending ? (pendingText ?? "Saving…") : children}
    </Button>
  );
}

/**
 * Whatever went wrong with the form as a whole — the server refused, the
 * session expired, two people saved at once.
 *
 * `role="alert"` because this appears after a submit that looked like it was
 * working. A sighted reader sees a red box arrive; without the role, somebody
 * listening gets nothing at all and is left waiting for a page that already
 * answered.
 */
export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-lg bg-[var(--color-danger-soft)] px-3 py-2 text-[13px] text-[var(--color-danger)]"
    >
      {message}
    </p>
  );
}

/**
 * What a Field hands down to the control inside it.
 *
 * Passing this through context rather than asking every caller to invent an id
 * is the whole point: there are around a hundred fields in this app, and a rule
 * that has to be remembered a hundred times is a rule that will be missed.
 */
type FieldWiring = {
  controlId: string;
  describedBy?: string;
  invalid: boolean;
};

const FieldContext = React.createContext<FieldWiring | null>(null);

/**
 * A labelled control.
 *
 * The label is tied to the control by id, which is what makes a screen reader
 * announce the field's name and what makes clicking the words put the cursor
 * in the box. Hint and error text are attached with aria-describedby, so they
 * are read after the name instead of being scenery the control knows nothing
 * about.
 */
export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  hint?: string;
  /**
   * A problem with this field specifically. Sets aria-invalid on the control
   * and is announced where it sits, so a long form does not turn into a hunt
   * for which box the message at the top was about.
   */
  error?: string | null;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const base = React.useId();
  const controlId = `${base}control`;
  const hintId = hint ? `${base}hint` : undefined;
  const errorId = error ? `${base}error` : undefined;

  const describedBy =
    [hintId, errorId].filter(Boolean).join(" ") || undefined;

  const wiring = React.useMemo<FieldWiring>(
    () => ({ controlId, describedBy, invalid: Boolean(error) }),
    [controlId, describedBy, error],
  );

  return (
    <FieldContext.Provider value={wiring}>
      <div className={className}>
        <label className="label" htmlFor={controlId}>
          {label}
          {required ? (
            // The control carries `required` itself, and that is what gets
            // announced. Left visible to assistive technology, the star would
            // be spoken as part of the field's name — "Project name star".
            <span aria-hidden="true" className="text-[var(--color-danger)]">
              {" *"}
            </span>
          ) : null}
        </label>
        {children}
        {hint ? (
          <p className="hint" id={hintId}>
            {hint}
          </p>
        ) : null}
        {error ? (
          <p
            role="alert"
            id={errorId}
            className="mt-1 text-xs text-[var(--color-danger)]"
          >
            {error}
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}

/**
 * The attributes that join a control to the Field around it. Anything the
 * caller set explicitly wins, so a form that already does its own wiring — or
 * a control used outside a Field entirely — is left alone.
 */
function useFieldWiring(props: {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: React.AriaAttributes["aria-invalid"];
}) {
  const field = React.useContext(FieldContext);
  if (!field) return undefined;

  return {
    id: props.id ?? field.controlId,
    "aria-describedby": props["aria-describedby"] ?? field.describedBy,
    "aria-invalid": props["aria-invalid"] ?? (field.invalid || undefined),
  };
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const wiring = useFieldWiring(props);
  return (
    <input {...props} {...wiring} className={cn("field", props.className)} />
  );
}

export function Textarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  const wiring = useFieldWiring(props);
  return (
    <textarea {...props} {...wiring} className={cn("field", props.className)} />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const wiring = useFieldWiring(props);
  return (
    <select {...props} {...wiring} className={cn("field", props.className)} />
  );
}
