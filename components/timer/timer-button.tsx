"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Play, Square } from "lucide-react";

import { startTimerAction, stopTimerAction } from "@/app/actions/timer";
import { Button } from "@/components/ui/button";
import { FormError, Input, SubmitButton } from "@/components/ui/form";
import { formatElapsed } from "@/lib/time";

export function TimerButton({
  ticketId,
  running,
}: {
  ticketId: string;
  /** ISO start time when this very ticket is being tracked right now. */
  running: string | null;
}) {
  const [state, action] = useActionState(startTimerAction, null);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  if (running) {
    return (
      <div className="space-y-2">
        <p className="text-[13px] text-[var(--color-muted)]">
          Tracking since{" "}
          <RunningClock
            startedAt={running}
            className="font-medium text-[var(--color-ink)]"
          />
        </p>
        <form action={stopTimerAction}>
          <Button type="submit" variant="danger" size="sm" className="w-full">
            <Square size={13} />
            Stop and log
          </Button>
        </form>
        <p className="text-[11.5px] text-[var(--color-muted)]">
          Sessions under a minute are discarded.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="ticketId" value={ticketId} />
      <FormError message={state?.error} />
      <Input name="note" placeholder="What are you working on? (optional)" />
      <SubmitButton size="sm" variant="secondary" className="w-full">
        <Play size={13} />
        Start timer
      </SubmitButton>
    </form>
  );
}

export function RunningClock({
  startedAt,
  className,
}: {
  startedAt: string;
  className?: string;
}) {
  const [now, setNow] = useState<number | null>(null);

  // Rendered only after mount so the server and client markup agree.
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const started = new Date(startedAt).getTime();
  return (
    <span className={className}>
      {now === null ? "—" : formatElapsed(now - started)}
    </span>
  );
}
