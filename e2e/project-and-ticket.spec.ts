import { expect, test } from "@playwright/test";

import { people, signIn, unique } from "./support/people";

/**
 * The path a studio actually walks on day one: make a project, put a ticket in
 * it. Both are server actions behind long forms, and both are the sort of thing
 * that typechecks and passes its unit tests while the form posts a field
 * nothing reads.
 *
 * Controls are addressed by role and accessible name rather than by CSS. That
 * is not purity — the project settings page carries a dozen checkboxes whose
 * text begins "Client", "Description", "Files", and a class selector would
 * quietly pick one of them the day the markup moves.
 */
test("a manager creates a project and puts a ticket in it", async ({ page }) => {
  await signIn(page, people.manager);

  const name = unique("Harbour rebuild");
  const key = `H${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  await page.goto("/projects/new");
  await page.getByRole("textbox", { name: "Project name" }).fill(name);
  await page.getByRole("textbox", { name: "Key" }).fill(key);
  await page
    .getByRole("textbox", { name: "Description", exact: true })
    .fill("Created by the end-to-end suite.");
  await page
    .getByRole("combobox", { name: "Client", exact: true })
    .selectOption({ label: "Acme Inc." });
  await page
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption({ label: "Active" });

  await page.getByRole("button", { name: "Create project" }).click();

  // Landing on the project is the proof the action returned an id rather than
  // an error the form swallowed.
  await expect(page).toHaveURL(/\/projects\/cm/);
  await expect(page.getByRole("heading", { name })).toBeVisible();

  const project = new URL(page.url()).pathname;
  const title = unique("Wire up the booking form");

  await page.goto(`${project}/tickets`);
  // The modal and its form are React; a click before hydration is a plain
  // submit of a form with no action, and nothing happens at all.
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "New ticket" }).click();

  await page.getByRole("textbox", { name: "Title" }).fill(title);
  await page
    .getByRole("textbox", { name: "Description", exact: true })
    .fill("Opened by the end-to-end suite.");
  await page
    .getByRole("combobox", { name: "Priority", exact: true })
    .selectOption({ label: "High" });

  const created = page.waitForResponse(
    (r) => r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Create ticket" }).click();
  await created;

  // Read it back from the server rather than from whatever the page is
  // showing: the row in the database is the claim being made.
  await page.reload();
  await expect(page.getByRole("link", { name: title })).toBeVisible();
});

test("a project cannot be created without a name", async ({ page }) => {
  await signIn(page, people.manager);
  await page.goto("/projects/new");

  await page.getByRole("button", { name: "Create project" }).click();

  // The browser's own required check should stop this before the server sees
  // it; either way the one thing that must not happen is a project appearing.
  await expect(page).toHaveURL(/\/projects\/new/);
});
