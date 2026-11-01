import { cn } from "@/lib/utils";

export function BudgetBar({
  spent,
  total,
  caption,
  className,
}: {
  spent: number;
  total: number | null | undefined;
  caption?: string;
  className?: string;
}) {
  const hasBudget = total != null && total > 0;
  const percent = hasBudget ? Math.min((spent / total) * 100, 100) : 0;
  const over = hasBudget && spent > total;
  const warning = hasBudget && !over && percent >= 80;

  return (
    <div className={cn("w-full", className)}>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-3)]">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            over
              ? "bg-[var(--color-danger)]"
              : warning
                ? "bg-[var(--color-warn)]"
                : "bg-[var(--color-ok)]",
          )}
          style={{ width: `${hasBudget ? percent : 0}%` }}
        />
      </div>
      {caption ? (
        <p
          className={cn(
            "mt-1 text-[12px]",
            over
              ? "font-medium text-[var(--color-danger)]"
              : "text-[var(--color-muted)]",
          )}
        >
          {caption}
          {over ? " · over budget" : ""}
        </p>
      ) : null}
    </div>
  );
}
