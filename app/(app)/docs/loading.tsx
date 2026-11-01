import {
  Skeleton,
  SkeletonPageHeader,
  SkeletonPanel,
} from "@/components/ui/skeleton";

export default function DocsLoading() {
  return (
    <>
      <SkeletonPageHeader withAction />
      <Skeleton className="mb-4 h-9 w-[420px] max-w-full rounded-[var(--radius-field)]" />
      <div className="space-y-6">
        <SkeletonPanel rows={2} />
        <SkeletonPanel rows={3} />
      </div>
    </>
  );
}
