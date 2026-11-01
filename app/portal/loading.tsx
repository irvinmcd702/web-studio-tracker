import { SkeletonCards, SkeletonPageHeader } from "@/components/ui/skeleton";

export default function PortalLoading() {
  return (
    <>
      <SkeletonPageHeader />
      <SkeletonCards count={2} />
    </>
  );
}
