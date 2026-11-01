import { SkeletonPageHeader, SkeletonPanel } from "@/components/ui/skeleton";

export default function RequestsLoading() {
  return (
    <>
      <SkeletonPageHeader />
      <SkeletonPanel rows={5} />
    </>
  );
}
