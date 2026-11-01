import { notFound, redirect } from "next/navigation";

import { requireStaff } from "@/lib/auth";
import { canConfigure } from "@/lib/permissions";
import { getStudioSettings } from "@/lib/settings";

/**
 * One gate for every outreach page.
 *
 * Two conditions, and they answer differently on purpose. Somebody who is not
 * an administrator or a manager is sent to their dashboard, the same as the
 * clients page does — they have an account here, they are simply in the wrong
 * place. A studio that has not switched outreach on gets a 404, because the
 * feature is meant to be **absent** when it is off rather than present and
 * empty, and an empty page holding a list of strangers is not a state anyone
 * should stumble into.
 */
export default async function OutreachLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireStaff();
  if (!canConfigure(user)) redirect("/dashboard");

  const settings = await getStudioSettings();
  if (!settings.outreachEnabled) notFound();

  return <>{children}</>;
}
