import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

import { Card } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

type Step = {
  title: string;
  description: string;
  href: string;
  cta: string;
  done: boolean;
};

/**
 * What a freshly installed tracker shows instead of four zeroes and three
 * empty panels. It disappears the moment the studio has its first project,
 * and it never appears again after that.
 */
export function FirstRun({
  hasWorkflow,
  hasPeople,
  hasClient,
  appUrl,
}: {
  hasWorkflow: boolean;
  hasPeople: boolean;
  hasClient: boolean;
  appUrl: string;
}) {
  const steps: Step[] = [
    {
      title: "Describe how work moves",
      description:
        "Statuses and the transitions between them. Projects pick one of these, and you can have several.",
      href: "/workflows",
      cta: "Open workflows",
      done: hasWorkflow,
    },
    {
      title: "Add the people",
      description:
        "Everyone gets a one-time link and sets their own password. Nobody types someone else's.",
      href: "/people",
      cta: "Invite people",
      done: hasPeople,
    },
    {
      title: "Add the first client",
      description:
        "A company and a contact. Their portal login is created from the same page.",
      href: "/clients",
      cta: "Add a client",
      done: hasClient,
    },
    {
      title: "Create the first project",
      description:
        "Pick the crew, set a budget in hours or a fixed price, and decide what the client sees.",
      href: "/projects/new",
      cta: "New project",
      done: false,
    },
  ];

  return (
    <Card className="mb-6 overflow-hidden">
      <div className="border-b border-[var(--color-line)] px-5 py-4">
        <h2 className="text-[15px] font-semibold">Set up the studio</h2>
        <p className="mt-1 text-[13px] text-[var(--color-muted)]">
          Four steps, about ten minutes. Everything here can be changed later.
        </p>
      </div>

      <ol className="divide-y divide-[var(--color-line)]">
        {steps.map((step, i) => (
          <li
            key={step.href}
            className="flex flex-wrap items-start gap-4 px-5 py-4"
          >
            <span
              className={cn(
                "num mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold",
                step.done
                  ? "bg-[var(--color-ok-soft)] text-[var(--color-ok)]"
                  : "bg-[var(--color-surface-3)] text-[var(--color-muted)]",
              )}
            >
              {step.done ? <Check size={13} /> : i + 1}
            </span>

            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-medium">{step.title}</p>
              <p className="mt-0.5 max-w-[62ch] text-[13px] leading-relaxed text-[var(--color-muted)]">
                {step.description}
              </p>
            </div>

            <Link
              href={step.href}
              className="inline-flex shrink-0 items-center gap-1 text-[13px] font-medium text-[var(--color-brand)] hover:underline"
            >
              {step.cta}
              <ArrowRight size={14} />
            </Link>
          </li>
        ))}
      </ol>

      <div className="border-t border-[var(--color-line)] bg-[var(--color-surface-2)] px-5 py-3.5">
        <p className="text-[12.5px] text-[var(--color-muted)]">
          Clients can also start a project themselves: the request form at{" "}
          <Link
            href="/intake"
            className="font-mono text-[var(--color-ink-2)] hover:underline"
          >
            {appUrl}/intake
          </Link>{" "}
          needs no account and lands in Requests.
        </p>
      </div>
    </Card>
  );
}
