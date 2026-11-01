import { SkeletonPageHeader, SkeletonTable } from "@/components/ui/skeleton";

export default function PeopleLoading() {
  return (
    <>
      <SkeletonPageHeader withAction />
      <SkeletonTable rows={6} columns={5} />
    </>
  );
}
