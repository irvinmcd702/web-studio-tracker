import { expect, type Page } from "@playwright/test";

/**
 * The seeded studio. Everyone shares a password because the seed says so, and
 * because a fixture that invents credentials proves nothing about the login
 * these tests are here to exercise.
 */
export const PASSWORD = "admin123";

export const people = {
  /** Ian Walker. Sees every project, on the crew or not. */
  admin: "admin@studio.com",
  /** Maria Kingsley. Manages Acme and Technoprom. */
  manager: "pm@studio.com",
  /** Arthur Levine. On Acme and Technoprom, and on nothing else. */
  developer: "dev@studio.com",
  /** Olivia Tate. The only person on the internal project. */
  designer: "design@studio.com",
  /** John Carter at Acme. Sees one portal and no staff page at all. */
  client: "client@acme.com",
} as const;

/**
 * Signs in through the form, not by forging a cookie.
 *
 * Fields are found by their label, which only works because the label is
 * attached to the control. That is deliberate: if the association is ever lost
 * again, every one of these tests stops at the login page rather than passing
 * against an interface nobody could use.
 */
export async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/(dashboard|portal)/);
}

/** A suffix that keeps one run's rows apart from another's within a run. */
export function unique(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 7)}`;
}

/** The projects this person can reach, as hrefs, read off the projects page. */
export async function visibleProjects(page: Page) {
  await page.goto("/projects");
  return page
    .locator('a[href^="/projects/cm"]')
    .evaluateAll((links) => [
      ...new Set(links.map((a) => a.getAttribute("href") ?? "")),
    ]);
}
