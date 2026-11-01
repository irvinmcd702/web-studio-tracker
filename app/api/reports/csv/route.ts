import type { NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { canConfigure, projectScope } from "@/lib/permissions";
import { buildReport, reportToCsv, resolvePeriod } from "@/lib/reports";
import { getStudioSettings } from "@/lib/settings";
import { dayKey } from "@/lib/time";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (user.role === "CLIENT" || !canConfigure(user)) {
    return new Response("Forbidden", { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const period = resolvePeriod({
    preset: params.get("preset") ?? undefined,
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
  });

  const report = await buildReport({
    from: period.from,
    to: period.to,
    scope: projectScope(user),
    projectId: params.get("projectId") || undefined,
    clientId: params.get("clientId") || undefined,
  });

  const fileName = `timesheet-${dayKey(period.from)}_${dayKey(period.to)}.csv`;

  // The BOM makes Excel open UTF-8 correctly instead of mangling accents.
  const studio = await getStudioSettings();

  return new Response(
    `﻿${reportToCsv(report, { showAgentHours: studio.agentHoursVisible })}`,
    {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "private, no-store",
      },
    },
  );
}
