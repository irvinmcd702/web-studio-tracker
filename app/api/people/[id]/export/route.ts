import { getCurrentUser } from "@/lib/auth";
import { canConfigure } from "@/lib/permissions";
import { exportFileName, exportPerson } from "@/lib/data-export";
import { logActivity } from "@/lib/activity";

/**
 * `GET /api/people/<id>/export` — everything held about one person, as JSON.
 *
 * Two callers, one path: a person asking for their own copy, and an
 * administrator answering a request on someone's behalf. Anyone else gets a
 * 404 rather than a 403, because "no such person" and "not your business" are
 * the same answer to someone probing for who has an account here.
 *
 * The download is logged. A file containing everything about a person should
 * leave a trace when it is made, and the person it is about can see that trace
 * in their own export.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const self = id === user.id;

  if (!self && !canConfigure(user)) {
    return new Response("Not found", { status: 404 });
  }

  const data = await exportPerson(id);
  if (!data) return new Response("Not found", { status: 404 });

  if (!self) {
    await logActivity({
      type: "user.exported",
      message: "downloaded a copy of another person's data",
      userId: user.id,
    });
  }

  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFileName(
        (data.account as { name: string }).name,
      )}"`,
      "Cache-Control": "no-store",
    },
  });
}
