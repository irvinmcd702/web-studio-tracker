import { prisma } from "./db";
import { pickPortalValues, type PortalToggleValues } from "./portal";

const SINGLETON_ID = "default";

/**
 * Studio-wide defaults live in a single row. Reading creates it on first use so
 * a fresh install doesn't need a separate bootstrap step.
 */
export async function getStudioSettings() {
  return prisma.studioSettings.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID },
    update: {},
  });
}

export async function getDefaultPortalValues(): Promise<PortalToggleValues> {
  return pickPortalValues(await getStudioSettings());
}

export async function saveDefaultPortalValues(values: PortalToggleValues) {
  await prisma.studioSettings.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, ...values },
    update: values,
  });
}
