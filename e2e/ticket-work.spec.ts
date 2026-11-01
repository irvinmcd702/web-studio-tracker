import { expect, test, type Page } from "@playwright/test";

import { people, signIn, unique, visibleProjects } from "./support/people";

/**
 * Moving a ticket and putting hours against it — the two things a developer
 * does most, and the two the server guards hardest. The rules themselves are
 * unit-tested to death; what is not, is whether the button on the page reaches
 * them.
 *
 * Both tests reload before they assert, and that is not politeness. Writing
 * these turned up a real defect: the action succeeds and the row changes in
 * the database, but the page it was submitted from often does not update —
 * the spent transition stays on offer, the logged hours stay invisible, until
 * something forces a fresh load. Asserting after a reload keeps these honest
 * about what they cover: that the work reaches the database and comes back on
 * the next read. The refresh itself is a separate defect and needs its own
 * fix, not a longer timeout here.
 */

/** Opens the first ticket of the first project this person can see. */
async function firstTicket(page: Page) {
  const [project] = await visibleProjects(page);
  await page.goto(`${project}/tickets`);
  const href = await page
    .locator('a[href^="/tickets/"]')
    .first()
    .getAttribute("href");

  if (!href) throw new Error("The seeded project has no tickets");
  await page.goto(href);

  // Every control here is a form with a server action, and none of them do
  // anything until React has hydrated. A click that lands first is a plain
  // submit of a form with no action.
  await page.waitForLoadState("networkidle");
  return href;
}

test("a ticket moves along its workflow", async ({ page }) => {
  await signIn(page, people.developer);
  await firstTicket(page);

  // Whatever transition the workflow offers. Naming a status here would tie
  // the test to the seed rather than to the mechanism.
  const forward = page.getByRole("button", { name: /^→/ }).first();
  const target = ((await forward.textContent()) ?? "")
    .replace(/^→\s*/, "")
    .trim();

  // Waiting for the action's own response before reloading. A reload fired
  // straight after the click cancels the request that is still in flight, and
  // the test then reports a transition that never got the chance to happen.
  const submitted = page.waitForResponse(
    (r) => r.request().method() === "POST" && r.url().includes("/tickets/"),
  );
  await forward.click();
  await submitted;

  await page.reload();

  // What the page offers is the readable proof of where the ticket is: the
  // transition that brought it here is spent, and the one back has appeared.
  await expect(page.getByRole("button", { name: /^←/ })).toBeVisible();
  await expect(
    page.getByRole("button", { name: `→ ${target}`, exact: true }),
  ).toHaveCount(0);
});

test("hours logged against a ticket reach it and the timesheet", async ({
  page,
}) => {
  await signIn(page, people.developer);
  const ticket = await firstTicket(page);

  const note = unique("Paired on the header");

  // Hours is a text box with inputMode="decimal", not a number spinner — a
  // spinner is a poor way to type a quarter of an hour.
  await page.getByRole("textbox", { name: "Hours" }).fill("1.5");
  await page.getByRole("textbox", { name: "What did you work on" }).fill(note);
  const submitted = page.waitForResponse(
    (r) => r.request().method() === "POST" && r.url().includes("/tickets/"),
  );
  await page.getByRole("button", { name: "Log time", exact: true }).click();
  await submitted;

  await page.reload();
  await expect(page.getByText(note)).toBeVisible();

  // The same entry, seen from the other end. These are two readings of one
  // row, and they have drifted apart before.
  await page.goto("/timesheet");
  await expect(page.locator(`a[href="${ticket}"]`).first()).toBeVisible();
});

test("a client cannot reach a staff ticket", async ({ page }) => {
  await signIn(page, people.developer);
  const ticket = await firstTicket(page);

  await page.context().clearCookies();
  await signIn(page, people.client);
  await page.goto(ticket);

  await expect(page).not.toHaveURL(ticket);
});
