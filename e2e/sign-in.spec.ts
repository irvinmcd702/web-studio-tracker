import { expect, test } from "@playwright/test";

import { PASSWORD, people, signIn } from "./support/people";

test.describe("signing in", () => {
  test("takes a member to their dashboard", async ({ page }) => {
    await signIn(page, people.developer);

    await expect(page.getByRole("heading", { name: /Hi, Arthur/ })).toBeVisible();
  });

  test("takes a client to the portal and nowhere else", async ({ page }) => {
    await signIn(page, people.client);
    await expect(page).toHaveURL(/\/portal/);

    // The staff side must not merely be unlinked; typing the address has to
    // land somewhere else. Every one of these is a page a client could guess.
    for (const route of ["/projects", "/dashboard", "/timesheet", "/settings"]) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/portal$/);
    }
  });

  test("refuses a wrong password, and says so where it can be heard", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(people.developer);
    await page.getByLabel("Password").fill("not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    // role="alert" is the point of the assertion, not the wording: the message
    // arrives after a submit that looked like it was working, and somebody who
    // cannot see the red box gets nothing without it.
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("sends a signed-out visitor to the login page", async ({ page }) => {
    await page.goto("/projects");

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("keeps the session across a full page load", async ({ page }) => {
    // The cookie is httpOnly and set by a server action; a redirect that drops
    // it looks fine until the first hard navigation.
    await signIn(page, people.developer);
    await page.goto("/timesheet");
    await page.reload();

    await expect(page.getByRole("heading", { name: "Timesheet" })).toBeVisible();
  });

  test("signs out", async ({ page }) => {
    await signIn(page, people.client);
    await page.getByRole("button", { name: "Sign out" }).click();

    await expect(page).toHaveURL(/\/login/);
    await page.goto("/portal");
    await expect(page).toHaveURL(/\/login/);
  });
});

test("does not put the password back in the box after a refusal", async ({
  page,
}) => {
  // A server-rendered form that re-populates itself from what was posted will
  // happily put the password in a value attribute, where it lands in the HTML,
  // in the browser cache, and in any proxy log along the way.
  const attempted = "hunter2-not-the-real-one";

  await page.goto("/login");
  await page.getByLabel("Email").fill(people.developer);
  await page.getByLabel("Password").fill(attempted);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toBeVisible();

  // The attribute, not the property: the property is live DOM state, which the
  // browser keeps because nothing navigated. The attribute is what the server
  // put in the markup, which is the only half that can leak.
  const rendered = await page
    .locator("input")
    .evaluateAll((inputs) => inputs.map((i) => i.getAttribute("value") ?? ""));

  expect(rendered.join("\n")).not.toContain(attempted);
  expect(await page.content()).not.toContain(attempted);
});
