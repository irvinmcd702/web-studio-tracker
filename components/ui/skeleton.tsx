import { cn } from "@/lib/utils";

/**
 * Loading placeholders that keep the shape of what is coming.
 *
 * The point is that the page doesn't jump when the data lands: a skeleton row
 * is the same height as a real one, a skeleton stat is the same card. They are
 * server components, rendered from `loading.tsx`, so they cost nothing on the
 * client.
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("skeleton", className)} aria-hidden {...props} />;
}

/** A line of fake text. Widths vary so it doesn't read as a table of blocks. */
export function SkeletonText({
  width = "100%",
  className,
}: {
  width?: string;
  className?: string;
}) {
  return (
    <Skeleton className={cn("h-3 rounded", className)} style={{ width }} />
  );
}

export function SkeletonPageHeader({
  withAction = false,
}: {
  withAction?: boolean;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 space-y-2">
        <Skeleton className="h-6 w-52 rounded" />
        <Skeleton className="h-3.5 w-72 rounded" />
      </div>
      {withAction ? (
        <Skeleton className="h-9.5 w-32 rounded-[var(--radius-field)]" />
      ) : null}
    </div>
  );
}

export function SkeletonStats({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card px-5 py-4">
          <Skeleton className="h-3 w-24 rounded" />
          <Skeleton className="mt-2.5 h-7 w-20 rounded" />
          <Skeleton className="mt-2.5 h-2.5 w-16 rounded" />
        </div>
      ))}
    </div>
  );
}

/** A card with a header strip and a few list rows, like most panels here. */
export function SkeletonPanel({
  rows = 4,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("card", className)}>
      <div className="border-b border-[var(--color-line)] px-5 py-3.5">
        <Skeleton className="h-3.5 w-40 rounded" />
      </div>
      <div className="divide-y divide-[var(--color-line)]">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-5 py-3.5">
            <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <SkeletonText width={`${58 + ((i * 13) % 30)}%`} />
              <SkeletonText
                width={`${28 + ((i * 17) % 22)}%`}
                className="h-2.5"
              />
            </div>
            <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonTable({
  rows = 6,
  columns = 5,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="flex gap-4 border-b border-[var(--color-line)] bg-[var(--color-surface-2)] px-4 py-2.5">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton
            key={i}
            className="h-2.5 rounded"
            style={{
              width: i === 0 ? "26%" : `${(74 / (columns - 1)).toFixed(1)}%`,
            }}
          />
        ))}
      </div>
      <div className="divide-y divide-[var(--color-line)]">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-4 px-4 py-3.5">
            {Array.from({ length: columns }).map((_, c) => (
              <div
                key={c}
                style={{
                  width:
                    c === 0 ? "26%" : `${(74 / (columns - 1)).toFixed(1)}%`,
                }}
              >
                <SkeletonText
                  width={c === 0 ? "82%" : `${45 + ((r + c) % 3) * 15}%`}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonCards({
  count = 4,
  columns = "md:grid-cols-2",
}: {
  count?: number;
  columns?: string;
}) {
  return (
    <div className={cn("grid gap-4", columns)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card space-y-3 p-5">
          <div className="flex items-start justify-between gap-3">
            <Skeleton className="h-4 w-44 rounded" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <SkeletonText width="60%" />
          <Skeleton className="h-1.5 w-full rounded-full" />
          <SkeletonText width="35%" className="h-2.5" />
        </div>
      ))}
    </div>
  );
}
