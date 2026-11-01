import { expect, test } from "@playwright/test";

import { people, signIn, unique, visibleProjects } from "./support/people";

/**
 * Uploads and downloads.
 *
 * Files are the one thing this app stores outside the database, deliberately
 * outside `public`, with the permission check on every read. That last part is
 * the whole design and it is invisible from the interface — a file served from
 * a guessable path would look exactly the same to the person who uploaded it,
 * and only different to everybody else.
 *
 * Every read here goes through page.goto rather than the API request context.
 * The session cookie is Secure in a production build, and an API context will
 * not put a Secure cookie on an http:// request even to a loopback address —
 * so it answers 401 to everything and every one of these tests passes for the
 * wrong reason. The browser sends it, because 127.0.0.1 is a trustworthy
 * origin. This is the difference between testing the read path and testing
 * Playwright.
 */

/** The first attachment link on a project's files page. */
async function firstFileHref(page: import("@playwright/test").Page) {
  const [project] = await visibleProjects(page);
  await page.goto(`${project}/files`);
  await page.waitForLoadState("networkidle");
  return page.locator('a[href^="/api/files/"]').first().getAttribute("href");
}

test("a file uploaded to a project comes back byte for byte", async ({
  page,
}) => {
  await signIn(page, people.developer);
  const [project] = await visibleProjects(page);
  await page.goto(`${project}/files`);
  await page.waitForLoadState("networkidle");

  const name = `${unique("brief")}.txt`;
  const body = `Written by the end-to-end suite at ${name}.\n`;

  await page.getByLabel("Files to upload").setInputFiles({
    name,
    mimeType: "text/plain",
    buffer: Buffer.from(body, "utf8"),
  });

  const submitted = page.waitForResponse(
    (r) => r.request().method() === "POST",
  );
  // Exact, because a file input answers to the button role too and its own
  // label ends in "upload".
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  await submitted;

  await page.reload();
  const link = page.getByRole("link", { name: new RegExp(name, "i") }).first();
  await expect(link).toBeVisible();

  const href = await link.getAttribute("href");
  expect(href).toBeTruthy();

  const response = await page.goto(href!);
  expect(response?.status()).toBe(200);
  expect(await response?.text()).toBe(body);
});

test("a file is not served to somebody who is not signed in", async ({
  page,
  browser,
}) => {
  await signIn(page, people.developer);
  const href = await firstFileHref(page);
  expect(href, "the project should have a file to read back").toBeTruthy();

  // A second browser: no cookie, nothing shared with the first.
  const stranger = await browser.newContext();
  const anonymous = await stranger.newPage();
  const response = await anonymous.goto(href!);
  const status = response?.status();
  await stranger.close();

  expect(status, "an unauthenticated read must not return the file").not.toBe(
    200,
  );
});

test("a file is not served to staff who are off the project", async ({
  page,
}) => {
  // Which pair to use has to be derived, not assumed. The designer turns out
  // to be on both of the developer's projects, so that way round proves
  // nothing — it passes because the read is allowed. The internal project is
  // the designer's and not the developer's.
  await signIn(page, people.developer);
  const theirs = await visibleProjects(page);

  await page.context().clearCookies();
  await signIn(page, people.designer);
  const mine = await visibleProjects(page);

  const target = mine.find((href) => !theirs.includes(href));
  expect(target, "the designer should be on a project the developer is not")
    .toBeTruthy();

  // Upload into that project here, so the test does not depend on the seed
  // having put an attachment in this particular one.
  await page.goto(`${target}/files`);
  await page.waitForLoadState("networkidle");

  const name = `${unique("internal")}.txt`;
  await page.getByLabel("Files to upload").setInputFiles({
    name,
    mimeType: "text/plain",
    buffer: Buffer.from("Not for the developer.\n", "utf8"),
  });
  const submitted = page.waitForResponse(
    (r) => r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  await submitted;

  await page.reload();
  const href = await page
    .getByRole("link", { name: new RegExp(name, "i") })
    .first()
    .getAttribute("href");
  expect(href).toBeTruthy();

  // Signed in, entitled to plenty, and still not to this.
  await page.context().clearCookies();
  await signIn(page, people.developer);

  const response = await page.goto(href!);
  expect(response?.status()).not.toBe(200);
});
