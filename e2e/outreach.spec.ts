import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { people, signIn, unique } from "./support/people";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/**
 * The outreach pages cannot go in the sweep in `accessibility.spec.ts`,
 * because they do not exist unless the studio has switched the feature on and
 * that sweep has no business toggling studio settings. So they are checked
 * here, where the state is already known.
 */
async function expectAccessible(page: Page, route: string) {
  await page.goto(route);
  await page.waitForLoadState("networkidle");

  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  const readable = violations.map((v) => ({
    rule: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => n.html.replace(/\s+/g, " ").slice(0, 120)),
  }));

  expect(readable, `${route} has accessibility violations`).toEqual([]);
}

/**
 * The lead base, end to end, including the half a recipient sees.
 *
 * The unit suite covers parsing, dedup, suppression and the token. What it
 * cannot see is whether the pieces are joined: that the settings switch really
 * makes the pages appear, that the form's provenance field is actually
 * required, and — the one that matters most — that a stranger holding an
 * unsubscribe link can use it while signed out and that merely opening it does
 * not unsubscribe them.
 */

const POSTAL = "Northwind Studio, 14 Bridge Street, Bristol BS1 4TT";

/**
 * Saves the outreach settings. Does **not** sign in — `signIn` starts at the
 * login page, which redirects to the dashboard once a session exists, so
 * calling it twice in one test hangs waiting for a field that is not there.
 *
 * `postalAddress` is a parameter because its absence is itself a case worth
 * testing: nothing may be approved for sending until the studio has one.
 */
async function setOutreach(
  page: Page,
  { postalAddress = POSTAL }: { postalAddress?: string } = {},
) {
  await page.goto("/settings");

  const toggle = page.getByLabel("Keep a lead base");
  const form = page.locator("form", { has: toggle });

  if (!(await toggle.isChecked())) await toggle.check();
  await form.getByLabel("Postal address").fill(postalAddress);

  const saved = page.waitForResponse((r) => r.request().method() === "POST");
  await form.getByRole("button", { name: "Save" }).click();
  await saved;
}

async function enableOutreach(
  page: Page,
  options: { postalAddress?: string } = {},
) {
  await signIn(page, people.admin);
  await setOutreach(page, options);
}

test("outreach is absent until the studio switches it on", async ({ page }) => {
  await signIn(page, people.admin);

  // Whatever a previous test left behind, put it back to off first.
  await page.goto("/settings");
  const toggle = page.getByLabel("Keep a lead base");
  if (await toggle.isChecked()) {
    await toggle.uncheck();
    const saved = page.waitForResponse((r) => r.request().method() === "POST");
    await page
      .locator("form", { has: toggle })
      .getByRole("button", { name: "Save" })
      .click();
    await saved;
  }

  await page.goto("/dashboard");
  await expect(
    page.getByRole("link", { name: "Outreach" }).first(),
  ).toHaveCount(0);

  // Absent, not empty: the page does not exist while the feature is off.
  const response = await page.goto("/outreach");
  expect(response?.status()).toBe(404);
});

test("a lead is added, then unsubscribes itself from a signed-out browser", async ({
  page,
  context,
}) => {
  await enableOutreach(page);

  await page.goto("/outreach/leads");
  await page.getByRole("button", { name: "New lead" }).click();

  const address = `${unique("ada")}@example.com`;
  const source = "Attendee list, WebSummit Oct 2026";

  // By accessible name: the visible label carries a required marker, so its
  // text is "Email *" while the name the control answers to is "Email".
  await page
    .getByRole("textbox", { name: "Where did this address come from" })
    .fill(source);
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(address);
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Ada Lovelace");

  const added = page.waitForResponse((r) => r.request().method() === "POST");
  await page.getByRole("button", { name: "Add lead" }).click();
  await added;

  await page.goto("/outreach/leads");
  const lead = page.getByRole("link", { name: /Ada Lovelace/ }).first();
  await expect(lead).toBeVisible();
  await lead.click();

  // The provenance is on the page, because it is what the first message to
  // this person would have to repeat back to them.
  await expect(page.getByText(source).first()).toBeVisible();

  const link = await page
    .getByText(/\/unsubscribe\//)
    .first()
    .textContent();
  expect(link).toBeTruthy();

  // A recipient has no session. A fresh context rather than a fresh page,
  // because a page in this one would carry the admin's cookie.
  const strangerContext = await context.browser()!.newContext();
  const stranger = await strangerContext.newPage();
  await stranger.goto(link!.trim());

  await expect(
    stranger.getByRole("heading", { name: "Stop these emails" }),
  ).toBeVisible();
  await expect(stranger.getByText(source)).toBeVisible();

  // Opening the link changed nothing — mail gateways prefetch every URL in a
  // message, and a GET that unsubscribed would catch people who never clicked.
  await page.goto("/outreach/suppression");
  await expect(page.getByText(address)).toHaveCount(0);

  await stranger.getByRole("button", { name: "Unsubscribe" }).click();
  await expect(
    stranger.getByRole("heading", { name: "You are unsubscribed" }),
  ).toBeVisible();
  await strangerContext.close();

  await page.goto("/outreach/suppression");
  await expect(page.getByText(address)).toBeVisible();
});

test("the outreach pages have no WCAG violations a machine can see", async ({
  page,
  context,
}) => {
  await enableOutreach(page);

  // A campaign, so the detail page is a real page rather than an empty state.
  await page.goto("/outreach/campaigns");
  await page.getByRole("button", { name: "New campaign" }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("textbox", { name: "Name", exact: true })
    .fill(unique("Axe"));
  await dialog.getByRole("button", { name: "Create campaign" }).click();
  await page.waitForURL(/\/outreach\/campaigns\/cm/);
  const campaign = page.url();

  for (const route of [
    "/outreach",
    "/outreach/leads",
    "/outreach/leads/import",
    "/outreach/suppression",
    "/outreach/campaigns",
    campaign,
    "/outreach/inbox",
    "/settings",
  ]) {
    await expectAccessible(page, route);
  }

  // The two a recipient sees, signed out.
  const strangerContext = await context.browser()!.newContext();
  const stranger = await strangerContext.newPage();
  await expectAccessible(stranger, "/unsubscribe");
  await expectAccessible(stranger, "/unsubscribe/done");
  await strangerContext.close();
});

test("a campaign sends nothing until somebody approves the first message", async ({
  page,
}) => {
  await enableOutreach(page);

  // A lead to write to.
  await page.goto("/outreach/leads");
  await page.getByRole("button", { name: "New lead" }).click();
  const address = `${unique("grace")}@example.com`;
  await page
    .getByRole("textbox", { name: "Where did this address come from" })
    .fill("Attendee list, WebSummit Oct 2026");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(address);
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Grace Hopper");
  let done = page.waitForResponse((r) => r.request().method() === "POST");
  await page.getByRole("button", { name: "Add lead" }).click();
  await done;

  // A campaign with one message in it. Locators are scoped to the dialog or
  // the form they belong to: this page carries several forms with a field
  // called Name, Subject or Message, and an unscoped role query matches them
  // all.
  await page.goto("/outreach/campaigns");
  await page.getByRole("button", { name: "New campaign" }).click();
  const name = unique("Agencies");
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Name", exact: true }).fill(name);
  await dialog.getByRole("button", { name: "Create campaign" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();

  const editor = page.locator("form", {
    has: page.getByRole("button", { name: "Add message" }),
  });
  await editor
    .getByRole("textbox", { name: "Subject" })
    .fill("A quick question");
  await editor
    .getByRole("textbox", { name: "Message" })
    .fill("{{greeting}}\n\nWe build websites for manufacturers. Worth a chat?");
  done = page.waitForResponse((r) => r.request().method() === "POST");
  await editor.getByRole("button", { name: "Add message" }).click();
  await done;

  // Enrol, and check that nothing has been scheduled by doing so.
  await page.getByRole("button", { name: "Enrol leads" }).click();
  done = page.waitForResponse((r) => r.request().method() === "POST");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Enrol", exact: true })
    .click();
  await done;

  await page.reload();
  await expect(page.getByText("Grace Hopper").first()).toBeVisible();
  await expect(page.getByText("Waiting for approval").first()).toBeVisible();

  // The gate: the rendered text is on screen, against a named lead, and
  // nothing can go out until a person presses this.
  const queue = page.locator("form", {
    has: page.getByRole("button", { name: "Approve and schedule" }),
  });
  const draft = await queue
    .getByRole("textbox", { name: "Message" })
    .first()
    .inputValue();
  expect(draft).toContain("Worth a chat?");

  done = page.waitForResponse((r) => r.request().method() === "POST");
  await queue.getByRole("button", { name: "Approve and schedule" }).click();
  await done;

  await page.reload();
  // Scheduled, not sent: no tick runs in these tests.
  await expect(
    page.getByText("Scheduled", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("In the sequence").first()).toBeVisible();
});

test("the overview says why nothing would send, rather than showing a queue that never moves", async ({
  page,
}) => {
  // There is no outreach transport configured in these runs, and there is no
  // postal address once it is cleared — either is enough to stop a send. Which
  // one comes first depends on the server, so the claim under test is that the
  // page names a reason and points at where to fix it, not which reason it is.
  await enableOutreach(page, { postalAddress: "" });

  await page.goto("/outreach");
  await expect(page.getByText(/nothing will send/i)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Studio settings" }),
  ).toBeVisible();

  // Put it back, so the order tests run in cannot matter.
  await setOutreach(page);
});

test("the outreach model switch is offered only when outreach is on", async ({
  page,
}) => {
  // Three separate questions, and the interface does not ask the third until
  // the first has been answered: there is nothing to allow while outreach
  // itself is switched off.
  await signIn(page, people.admin);

  await page.goto("/settings");
  const outreach = page.getByLabel("Keep a lead base");
  if (await outreach.isChecked()) {
    await outreach.uncheck();
    const saved = page.waitForResponse((r) => r.request().method() === "POST");
    await page
      .locator("form", { has: outreach })
      .getByRole("button", { name: "Save" })
      .click();
    await saved;
  }

  // A full load, so what is asserted is what the server renders rather than
  // whatever the action left on screen.
  await page.reload();
  await expect(page.getByLabel("Outreach may use it too")).toHaveCount(0);

  await setOutreach(page);
  await page.reload();
  await expect(page.getByLabel("Outreach may use it too")).toBeVisible();
});
