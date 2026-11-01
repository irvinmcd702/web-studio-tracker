import { SkeletonCards, SkeletonPageHeader } from "@/components/ui/skeleton";

export default function WorkflowsLoading() {
  return (
    <>
      <SkeletonPageHeader withAction />
      <SkeletonCards count={2} columns="md:grid-cols-2" />
    </>
  );
}
