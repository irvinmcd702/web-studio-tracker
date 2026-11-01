import { expect, test } from "@playwright/test";

import { people, signIn, visibleProjects } from "./support/people";

/**
 * A project nobody put you on should not open because you know its address.
 *
 * The permission rules have thorough unit tests. What those cannot say is
 * whether every page under a project actually consults them — and a project
 * has ten of them, each a separate file, each free to forget.
 */
test("a project you are not on does not open, whichever page you try", async ({
  page,
}) => {
  // The admin sees everything, so the difference between the two lists is a
  // project the developer has no business reading.
  await signIn(page, people.admin);
  const all = await visibleProjects(page);

  await page.context().clearCookies();
  await signIn(page, people.developer);
  const mine = await visibleProjects(page);

  const forbidden = all.find((href) => !mine.includes(href));
  expect(forbidden, "the seed should leave one project off the crew").toBeTruthy();

  const pages = [
    "",
    "/tickets",
    "/board",
    "/files",
    "/budget",
    "/approvals",
    "/docs",
    "/chat",
    "/meetings",
    "/settings",
  ];

  for (const suffix of pages) {
    await page.goto(`${forbidden}${suffix}`);

    // Refused is refused however it is phrased; what matters is that nothing
    // belonging to the project is on the screen.
    await expect(
      page.getByRole("heading", { name: /isn't here|not found|no access/i }),
      `${suffix || "/"} should refuse`,
    ).toBeVisible();
  }
});

test("the project is missing from the developer's own list", async ({
  page,
}) => {
  await signIn(page, people.admin);
  const all = await visibleProjects(page);

  await page.context().clearCookies();
  await signIn(page, people.developer);
  const mine = await visibleProjects(page);

  expect(mine.length).toBeLessThan(all.length);
});
