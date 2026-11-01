import { SkeletonPageHeader, SkeletonTable } from "@/components/ui/skeleton";

export default function ClientsLoading() {
  return (
    <>
      <SkeletonPageHeader withAction />
      <SkeletonTable rows={5} columns={5} />
    </>
  );
}
