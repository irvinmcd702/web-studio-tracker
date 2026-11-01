import * as React from "react";
import { cn, initials } from "@/lib/utils";

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("card", className)} {...props} />;
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 border-b border-[var(--color-line)] px-5 py-3.5",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-[14px] font-semibold">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-[12.5px] text-[var(--color-muted)]">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function Badge({
  className,
  color,
  children,
}: {
  className?: string;
  /** Hex colour from the database — tinted so it reads on either theme. */
  color?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-medium",
        color
          ? "tint"
          : "border border-[var(--color-line)] bg-[var(--color-surface-3)] text-[var(--color-ink-2)]",
        className,
      )}
      style={color ? ({ "--tint": color } as React.CSSProperties) : undefined}
    >
      {children}
    </span>
  );
}

export function Dot({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}

export function Avatar({
  name,
  color = "#6366f1",
  size = 28,
  title,
}: {
  name: string;
  color?: string;
  size?: number;
  title?: string;
}) {
  return (
    <span
      title={title ?? name}
      className="avatar inline-flex shrink-0 items-center justify-center rounded-full font-semibold"
      style={
        {
          "--avatar": color,
          width: size,
          height: size,
          fontSize: Math.round(size * 0.4),
        } as React.CSSProperties
      }
    >
      {initials(name)}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {icon ? <div className="text-[var(--color-faint)]">{icon}</div> : null}
      <p className="text-[13.5px] font-medium">{title}</p>
      {description ? (
        <p className="max-w-sm text-[13px] leading-relaxed text-[var(--color-muted)]">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
  breadcrumb,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  breadcrumb?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {breadcrumb ? (
          <div className="mb-1.5 text-[12.5px] text-[var(--color-muted)]">
            {breadcrumb}
          </div>
        ) : null}
        <h1 className="truncate text-[21px] font-semibold">{title}</h1>
        {description ? (
          <p className="mt-1 text-[13.5px] text-[var(--color-muted)]">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="flex items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "default" | "warn" | "danger" | "ok";
}) {
  const toneClass = {
    default: "text-[var(--color-ink)]",
    ok: "text-[var(--color-ok)]",
    warn: "text-[var(--color-warn)]",
    danger: "text-[var(--color-danger)]",
  }[tone];

  return (
    <div className="card px-5 py-4">
      <p className="text-[12.5px] text-[var(--color-muted)]">{label}</p>
      <p
        className={cn(
          "num mt-1.5 text-[26px] font-semibold leading-none",
          toneClass,
        )}
      >
        {value}
      </p>
      {sub ? (
        <p className="mt-2 text-[12px] text-[var(--color-muted)]">{sub}</p>
      ) : null}
    </div>
  );
}
