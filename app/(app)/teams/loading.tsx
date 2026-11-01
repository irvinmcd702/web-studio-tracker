import { SkeletonCards, SkeletonPageHeader } from "@/components/ui/skeleton";

export default function TeamsLoading() {
  return (
    <>
      <SkeletonPageHeader withAction />
      <SkeletonCards count={3} columns="md:grid-cols-2 xl:grid-cols-3" />
    </>
  );
}
