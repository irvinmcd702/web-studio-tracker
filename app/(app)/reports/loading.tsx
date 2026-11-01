import {
  Skeleton,
  SkeletonPageHeader,
  SkeletonStats,
  SkeletonTable,
} from "@/components/ui/skeleton";

export default function ReportsLoading() {
  return (
    <>
      <SkeletonPageHeader withAction />
      <Skeleton className="mb-6 h-[72px] w-full rounded-[var(--radius-card)]" />
      <SkeletonStats count={3} />
      <div className="mt-6 space-y-6">
        <SkeletonTable rows={4} columns={5} />
        <SkeletonTable rows={6} columns={6} />
      </div>
    </>
  );
}
