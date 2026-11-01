import {
  SkeletonPageHeader,
  SkeletonStats,
  SkeletonTable,
} from "@/components/ui/skeleton";

export default function TimesheetLoading() {
  return (
    <>
      <SkeletonPageHeader withAction />
      <SkeletonStats count={3} />
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <SkeletonTable rows={5} columns={9} />
        </div>
        <div className="card h-64" />
      </div>
    </>
  );
}
