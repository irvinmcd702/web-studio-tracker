import { Skeleton, SkeletonPanel } from "@/components/ui/skeleton";

export default function TicketLoading() {
  return (
    <>
      <div className="mb-6 space-y-2">
        <Skeleton className="h-3 w-64 rounded" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
        <Skeleton className="h-7 w-[420px] max-w-full rounded" />
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <SkeletonPanel rows={2} />
          <SkeletonPanel rows={3} />
        </div>
        <div className="space-y-6">
          <SkeletonPanel rows={5} />
        </div>
      </div>
    </>
  );
}
