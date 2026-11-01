import {
  Skeleton,
  SkeletonPanel,
  SkeletonStats,
} from "@/components/ui/skeleton";

export default function PortalProjectLoading() {
  return (
    <>
      <div className="mb-6 space-y-2">
        <Skeleton className="h-3 w-28 rounded" />
        <Skeleton className="h-7 w-80 max-w-full rounded" />
        <Skeleton className="h-3.5 w-56 rounded" />
      </div>
      <SkeletonStats count={3} />
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <SkeletonPanel rows={3} />
        <SkeletonPanel rows={3} />
      </div>
    </>
  );
}
