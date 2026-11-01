import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { people, signIn, visibleProjects } from "./support/people";

/**
 * Every page, checked against WCAG 2.2 AA by a machine.
 *
 * A machine finds perhaps a third of what is wrong with a page, and none of
 * what is wrong with a flow — it cannot tell you a form is confusing or that
 * the tab order makes no sense. What it does catch is the third that is pure
 * neglect: a button with no name, a select with no label, text nobody with
 * ordinary eyesight can read on a grey card. That third is also the third that
 * comes back, one component at a time, unless something is watching.
 *
 * Its first run found four: two unnamed icon buttons and an unlabelled select
 * on project settings, muted text that missed 4.5:1 on half the surfaces it
 * sits on, workflow chips printing a user-chosen colour as text on a tint of
 * itself, and a chat log that scrolled but could not be reached by keyboard.
 */

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function expectAccessible(page: Page, route: string) {
  await page.goto(route);
  await page.waitForLoadState("networkidle");

  const { violations } = await new AxeBuilder({ page })
    .withTags(WCAG)
    .analyze();

  // The default assertion message is the whole result object. This one says
  // which rule, on which page, and points at the element.
  const readable = violations.map((v) => ({
    rule: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => n.html.replace(/\s+/g, " ").slice(0, 120)),
  }));

  expect(readable, `${route} has accessibility violations`).toEqual([]);
}

test.describe("the staff interface", () => {
  // Seventeen pages through axe is slower than a normal test and much faster
  // than finding this by hand.
  test.setTimeout(240_000);

  test("has no WCAG violations a machine can see", async ({ page }) => {
    await signIn(page, people.admin);
    const all = await visibleProjects(page);

    // A project with tickets in it, so the list and the ticket page are real
    // pages rather than empty states.
    let project = all[0];
    let ticket: string | null = null;
    for (const candidate of all) {
      await page.goto(`${candidate}/tickets`);
      if (await page.locator('a[href^="/tickets/"]').count()) {
        project = candidate;
        ticket = await page
          .locator('a[href^="/tickets/"]')
          .first()
          .getAttribute("href");
        break;
      }
    }

    // The two pages that carry the diary. Both are detail routes, so the
    // sweep has to go and find one of each rather than name a fixed id.
    await page.goto("/requests");
    const request = await page
      .locator('a[href^="/requests/"]')
      .first()
      .getAttribute("href");
    await page.goto("/clients");
    const client = await page
      .locator('a[href^="/clients/"]')
      .first()
      .getAttribute("href");

    const routes = [
      "/dashboard",
      "/projects",
      "/projects/new",
      project,
      `${project}/tickets`,
      `${project}/board`,
      `${project}/budget`,
      `${project}/settings`,
      ticket ?? "/dashboard",
      "/timesheet",
      "/my-tasks",
      "/requests",
      request ?? "/requests",
      client ?? "/clients",
      "/reports",
      "/people",
      "/workflows",
      "/docs",
      "/settings",
    ];

    for (const route of routes) await expectAccessible(page, route);
  });
});

test.describe("the client portal", () => {
  test.setTimeout(120_000);

  test("has no WCAG violations a machine can see", async ({ page }) => {
    await expectAccessible(page, "/login");

    await signIn(page, people.client);
    await expectAccessible(page, "/portal");

    const portal = await page
      .locator('a[href^="/portal/cm"]')
      .first()
      .getAttribute("href");
    expect(portal, "the seeded client should have a project").toBeTruthy();

    await expectAccessible(page, portal!);
    await expectAccessible(page, "/portal/privacy");
  });
});

test.describe("dark mode", () => {
  test.setTimeout(120_000);

  // Contrast is the one rule whose answer changes with the theme, and dark
  // mode is a second set of colours that nothing else here ever looks at.
  test("holds the same contrast as the light theme", async ({ page }) => {
    await signIn(page, people.admin);

    await page.addInitScript(() => {
      window.localStorage.setItem("studio-theme", "dark");
    });

    const [project] = await visibleProjects(page);

    for (const route of [
      "/dashboard",
      project,
      "/timesheet",
      "/workflows",
      "/settings",
    ]) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");

      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

      const { violations } = await new AxeBuilder({ page })
        .withTags(WCAG)
        .withRules(["color-contrast"])
        .analyze();

      expect(
        violations.map((v) => v.nodes.map((n) => n.html.slice(0, 120))),
        `${route} in dark mode`,
      ).toEqual([]);
    }
  });
});
