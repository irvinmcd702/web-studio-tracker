import { getCurrentUser } from "@/lib/auth";
import { canConfigure } from "@/lib/permissions";
import { getStudioSettings } from "@/lib/settings";
import { exportLead } from "@/lib/lead-export";
import { logActivity } from "@/lib/activity";

/**
 * `GET /api/outreach/leads/<id>/export` — everything held about one lead.
 *
 * `exportPerson` next door answers the same question for a `User`, and cannot
 * answer it here: a lead has no account. Since a lead is also the person most
 * likely to ask — they never signed up for any of this — the export exists
 * from the day the first list is imported.
 *
 * Logged, like the staff export, for the same reason: a file containing
 * everything about a person should leave a trace when somebody makes one.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user || !canConfigure(user)) {
    return new Response("Not found", { status: 404 });
  }

  const settings = await getStudioSettings();
  if (!settings.outreachEnabled) {
    return new Response("Not found", { status: 404 });
  }

  const { id } = await params;
  const data = await exportLead(id);
  if (!data) return new Response("Not found", { status: 404 });

  await logActivity({
    type: "lead.exported",
    message: "downloaded everything held about a lead",
    userId: user.id,
  });

  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="lead-${id}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
