import { expect, test, type Page } from "@playwright/test";

import { people, signIn, unique } from "./support/people";

/**
 * The diary on a request.
 *
 * The vitest suite already proves what an entry is and that entries only ever
 * get added. What it cannot see is the join: that the triage form's Save
 * actually reaches the action that writes one, and that a note typed into the
 * box comes back on the page. That is the whole of what is here.
 */

async function openARequest(page: Page) {
  await signIn(page, people.manager);
  await page.goto("/requests");

  const href = await page
    .locator('a[href^="/requests/cm"]')
    .first()
    .getAttribute("href");

  if (!href) throw new Error("The seed has no client requests");
  await page.goto(href);
  await page.waitForLoadState("networkidle");
  return href;
}

test("moving a request records who moved it, and from what to what", async ({
  page,
}) => {
  const request = await openARequest(page);

  const status = page.getByLabel("Status");
  const before = await status.inputValue();
  // Somewhere else to go that is not where it already is, and not CONVERTED —
  // that one is refused unless a project exists.
  const after = before === "IN_REVIEW" ? "ACCEPTED" : "IN_REVIEW";

  await status.selectOption(after);
  const saved = page.waitForResponse((r) => r.request().method() === "POST");
  await page.getByRole("button", { name: "Save" }).click();
  await saved;

  await page.goto(request);

  const line = page.getByText(/^Status: .+ → .+$/).first();
  await expect(line).toBeVisible();
  // Maria Kingsley, by name: an unattributed history is the thing this
  // replaces.
  await expect(page.getByText("Maria Kingsley").first()).toBeVisible();
});

test("a note typed into the box comes back, and cannot then be edited", async ({
  page,
}) => {
  const request = await openARequest(page);
  const note = unique("Rang them about the launch date");

  await page.getByLabel("Note").fill(note);
  const saved = page.waitForResponse((r) => r.request().method() === "POST");
  await page.getByRole("button", { name: "Add note" }).click();
  await saved;

  await expect(page.getByText(note)).toBeVisible();

  // The guarantee the whole table rests on: having written one, the page
  // offers no way to change it. Reloading is deliberate — the assertion is
  // about the rendered record, not about a form that has just reset.
  await page.goto(request);
  await expect(page.getByText(note)).toBeVisible();

  const entry = page.locator("li", { hasText: note }).last();
  await expect(entry.getByRole("button")).toHaveCount(0);
  await expect(entry.getByRole("textbox")).toHaveCount(0);
});
