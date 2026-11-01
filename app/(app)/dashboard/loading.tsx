import {
  SkeletonPageHeader,
  SkeletonPanel,
  SkeletonStats,
} from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <>
      <SkeletonPageHeader />
      <SkeletonStats />
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <SkeletonPanel rows={3} />
          <SkeletonPanel rows={3} />
        </div>
        <SkeletonPanel rows={6} />
      </div>
    </>
  );
}
