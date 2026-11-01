import { expect, test } from "@playwright/test";

import { people, signIn } from "./support/people";

/**
 * The portal's one consequential act. Everything else a client does there is
 * reading; this is the button that says a stage is agreed and can be invoiced,
 * so it has to be the client's own decision, recorded against their name.
 */

async function openPortalProject(page: import("@playwright/test").Page) {
  await signIn(page, people.client);
  await page.goto("/portal");

  const href = await page
    .locator('a[href^="/portal/cm"]')
    .first()
    .getAttribute("href");

  if (!href) throw new Error("The seeded client has no project in the portal");
  await page.goto(href);
  await page.waitForLoadState("networkidle");
  return href;
}

test("a client approves the stage that is waiting on them", async ({ page }) => {
  const portal = await openPortalProject(page);

  const approve = page.getByRole("button", { name: "Approve" }).first();
  await expect(approve).toBeVisible();

  const submitted = page.waitForResponse(
    (r) => r.request().method() === "POST",
  );
  await approve.click();
  await submitted;

  await page.goto(portal);

  // Nothing is waiting on them any more, and the decision is on the record
  // rather than merely absent from the queue.
  await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);
  await expect(page.getByText(/approved/i).first()).toBeVisible();
});

test("the studio sees the client's decision", async ({ page }) => {
  const portal = await openPortalProject(page);
  const projectId = portal.split("/").pop();

  const approve = page.getByRole("button", { name: "Approve" }).first();
  if (await approve.count()) {
    const submitted = page.waitForResponse(
      (r) => r.request().method() === "POST",
    );
    await approve.click();
    await submitted;
  }

  // Same fact, read from the other side of the wall.
  await page.context().clearCookies();
  await signIn(page, people.manager);
  await page.goto(`/projects/${projectId}/approvals`);

  await expect(page.getByText(/approved/i).first()).toBeVisible();
});

test("a member of staff cannot approve on the client's behalf", async ({
  page,
}) => {
  await signIn(page, people.client);
  await page.goto("/portal");
  const portal = await page
    .locator('a[href^="/portal/cm"]')
    .first()
    .getAttribute("href");

  // The portal is the client's own view. Staff following the same address must
  // not land in it, whatever else they are allowed to do on the project.
  await page.context().clearCookies();
  await signIn(page, people.developer);
  await page.goto(portal!);

  await expect(page).not.toHaveURL(portal!);
});
