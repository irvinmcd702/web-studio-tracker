import { SkeletonPageHeader, SkeletonPanel } from "@/components/ui/skeleton";

export default function MyTasksLoading() {
  return (
    <>
      <SkeletonPageHeader />
      <div className="space-y-6">
        <SkeletonPanel rows={4} />
        <SkeletonPanel rows={3} />
      </div>
    </>
  );
}
