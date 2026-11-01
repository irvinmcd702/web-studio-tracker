import { SkeletonPanel, SkeletonStats } from "@/components/ui/skeleton";

/**
 * Covers every project tab: the header and tabs come from the layout, which
 * has already rendered by the time this shows.
 */
export default function ProjectTabLoading() {
  return (
    <>
      <SkeletonStats count={3} />
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <SkeletonPanel rows={4} />
        </div>
        <div className="space-y-6">
          <SkeletonPanel rows={3} />
        </div>
      </div>
    </>
  );
}
