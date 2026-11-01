import { Skeleton, SkeletonPageHeader } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <>
      <SkeletonPageHeader />
      <div className="grid gap-6 xl:grid-cols-2">
        <Skeleton className="h-72 rounded-[var(--radius-card)]" />
        <Skeleton className="h-72 rounded-[var(--radius-card)]" />
      </div>
    </>
  );
}
