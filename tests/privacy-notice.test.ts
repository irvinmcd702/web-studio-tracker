import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { describePeriod, privacyFacts } from "../lib/privacy-notice";
import { db, makeProject, makeWorkflow, resetDb } from "./setup/db";

async function settings(data: Record<string, unknown> = {}) {
  return db.studioSettings.upsert({
    where: { id: "default" },
    create: { id: "default", ...data },
    update: data,
  });
}

async function clientWithProject(aiAllowed = false) {
  const workflow = await makeWorkflow();
  const client = await db.client.create({ data: { name: "Acme" } });
  await makeProject({
    workflowId: workflow.id,
    clientId: client.id,
    name: "Acme store",
    aiAllowed,
  });
  return client;
}

const names = (facts: { recipients: { name: string }[] }) =>
  facts.recipients.map((r) => r.name).join(" | ");

describe("the notice follows the configuration", () => {
  beforeEach(async () => {
    await resetDb();
    delete process.env.SMTP_URL;
    delete process.env.SMTP_HOST;
    delete process.env.OPENROUTER_API_KEY;
  });

  afterEach(() => {
    delete process.env.SMTP_URL;
    delete process.env.OPENROUTER_API_KEY;
  });

  it("names only the host when nothing is switched on", async () => {
    await settings();
    const client = await clientWithProject();

    const facts = await privacyFacts(client.id);

    expect(facts.recipients).toHaveLength(1);
    expect(names(facts)).toContain("hosts this tracker");
  });

  it("names the mail provider once there is one", async () => {
    await settings();
    process.env.SMTP_URL = "smtp://user:pass@mail.example.com:587";
    const client = await clientWithProject();

    expect(names(await privacyFacts(client.id))).toContain("email provider");
  });

  it("names the chat provider only when messages are actually forwarded", async () => {
    const client = await clientWithProject();

    // Integration on, but this particular event switched off: nothing of the
    // customer's leaves, so nothing is claimed.
    await settings({ rocketChatEnabled: true, notifyClientMessage: false });
    expect(names(await privacyFacts(client.id))).not.toContain("Rocket.Chat");

    await settings({ rocketChatEnabled: true, notifyClientMessage: true });
    expect(names(await privacyFacts(client.id))).toContain("Rocket.Chat");
  });

  it("names the model provider only for projects that allow it", async () => {
    process.env.OPENROUTER_API_KEY = "key";
    await settings({ aiEnabled: true, aiModel: "test/model" });

    const refusing = await clientWithProject(false);
    expect(names(await privacyFacts(refusing.id))).not.toContain("model");

    const workflow = await makeWorkflow();
    const allowing = await db.client.create({ data: { name: "Bakery" } });
    await makeProject({
      workflowId: workflow.id,
      clientId: allowing.id,
      name: "Bakery shop",
      aiAllowed: true,
    });

    const facts = await privacyFacts(allowing.id);
    expect(names(facts)).toContain("test/model");
    // And it says which project, because the answer differs per project.
    expect(facts.recipients.map((r) => r.what).join(" ")).toContain(
      "Bakery shop",
    );
    expect(facts.aiForThisProject).toBe(true);
  });

  it("stays quiet about the model when the studio switch is off", async () => {
    process.env.OPENROUTER_API_KEY = "key";
    await settings({ aiEnabled: false });
    const client = await clientWithProject(true);

    expect(names(await privacyFacts(client.id))).not.toContain("model");
  });

  it("does not claim a controller nobody named", async () => {
    await settings();
    const client = await clientWithProject();

    const facts = await privacyFacts(client.id);

    expect(facts.controller.name).toBeNull();
    expect(facts.controller.contact).toBeNull();
  });

  it("passes on the studio's own wording when there is some", async () => {
    await settings({
      studioLegalName: "  Example Studio Ltd  ",
      privacyContactEmail: "privacy@example.com",
      privacyNoteExtra: "  We rely on contract. ",
    });
    const client = await clientWithProject();

    const facts = await privacyFacts(client.id);

    expect(facts.controller.name).toBe("Example Studio Ltd");
    expect(facts.controller.contact).toBe("privacy@example.com");
    expect(facts.extra).toBe("We rely on contract.");
  });

  it("reports the retention periods actually configured", async () => {
    await settings({ retainChatDays: 730, retainActivityDays: 0 });
    const client = await clientWithProject();

    const facts = await privacyFacts(client.id);

    expect(facts.retention.chatDays).toBe(730);
    expect(facts.retention.indefinite).toBe(false);
  });
});

describe("saying how long in words", () => {
  it("does not pretend a period exists when none was set", () => {
    expect(describePeriod(0)).toBe(
      "kept for as long as the studio holds the project",
    );
  });

  it("counts in years where that reads better", () => {
    expect(describePeriod(365)).toBe("kept for 1 year");
    expect(describePeriod(730)).toBe("kept for 2 years");
    expect(describePeriod(90)).toBe("kept for 90 days");
  });
});
