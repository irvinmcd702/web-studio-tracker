import {
  Skeleton,
  SkeletonPageHeader,
  SkeletonTable,
} from "@/components/ui/skeleton";

export default function ProjectsLoading() {
  return (
    <>
      <SkeletonPageHeader withAction />
      <Skeleton className="mb-4 h-9 w-[430px] max-w-full rounded-[var(--radius-field)]" />
      <SkeletonTable rows={5} columns={6} />
    </>
  );
}
