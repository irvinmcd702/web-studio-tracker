import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { aiSpend, draft } from "../lib/ai";
import {
  acceptancePrompt,
  chatSummaryPrompt,
  requestDraftPrompt,
} from "../lib/ai-drafts";
import { db, makeProject, makeUser, makeWorkflow, resetDb } from "./setup/db";

const KEY = "test-openrouter-key";

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const answer = (text: string) =>
  reply({
    choices: [{ message: { content: text } }],
    usage: { prompt_tokens: 120, completion_tokens: 80, cost: 0.0042 },
  });

async function settings(data: Record<string, unknown>) {
  return db.studioSettings.upsert({
    where: { id: "default" },
    create: { id: "default", ...data },
    update: data,
  });
}

async function allowedProject(aiAllowed = true) {
  const workflow = await makeWorkflow();
  return makeProject({ workflowId: workflow.id, status: "ACTIVE", aiAllowed });
}

describe("the gates before anything is sent", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    await resetDb();
    fetchMock = vi.fn(async () => answer("drafted"));
    vi.stubGlobal("fetch", fetchMock);
    process.env.OPENROUTER_API_KEY = KEY;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENROUTER_API_KEY;
  });

  const ask = (projectId: string | null) =>
    draft({
      kind: "acceptance",
      system: "s",
      prompt: "p",
      projectId,
      userId: null,
    });

  it("refuses without a key, and does not call out", async () => {
    delete process.env.OPENROUTER_API_KEY;
    await settings({ aiEnabled: true });
    const project = await allowedProject();

    const result = await ask(project.id);

    expect(result).toMatchObject({ ok: false, failure: "no_key" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses while the studio switch is off", async () => {
    await settings({ aiEnabled: false });
    const project = await allowedProject();

    expect(await ask(project.id)).toMatchObject({
      ok: false,
      failure: "disabled",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a project that has not agreed — nothing leaves the building", async () => {
    await settings({ aiEnabled: true });
    const project = await allowedProject(false);

    const result = await ask(project.id);

    expect(result).toMatchObject({ ok: false, failure: "project_denied" });
    // The assertion that matters: no request was made at all.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to the studio default when there is no project yet", async () => {
    await settings({ aiEnabled: true, aiDefaultAllowed: false });

    expect(await ask(null)).toMatchObject({
      ok: false,
      failure: "studio_default_denied",
    });
    expect(fetchMock).not.toHaveBeenCalled();

    await settings({ aiEnabled: true, aiDefaultAllowed: true });
    expect(await ask(null)).toMatchObject({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not write a usage row for a refusal it never paid for", async () => {
    await settings({ aiEnabled: false });
    const project = await allowedProject();

    await ask(project.id);

    expect(await db.aiUsage.count()).toBe(0);
  });
});

describe("a call that goes through", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    await resetDb();
    fetchMock = vi.fn(async () => answer("- [ ] The basket survives a reload"));
    vi.stubGlobal("fetch", fetchMock);
    process.env.OPENROUTER_API_KEY = KEY;
    await settings({ aiEnabled: true, aiModel: "test/model" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENROUTER_API_KEY;
  });

  it("returns the text and records what it cost", async () => {
    const user = await makeUser();
    const project = await allowedProject();

    const result = await draft({
      kind: "acceptance",
      system: "system text",
      prompt: "prompt text",
      projectId: project.id,
      userId: user.id,
    });

    expect(result).toMatchObject({
      ok: true,
      text: "- [ ] The basket survives a reload",
    });

    const row = await db.aiUsage.findFirstOrThrow();
    expect(row).toMatchObject({
      kind: "acceptance",
      model: "test/model",
      projectId: project.id,
      userId: user.id,
      ok: true,
      promptTokens: 120,
      completionTokens: 80,
      costUsd: 0.0042,
    });
  });

  it("sends the model and both messages, and nothing else", async () => {
    const project = await allowedProject();

    await draft({
      kind: "acceptance",
      system: "system text",
      prompt: "prompt text",
      projectId: project.id,
      userId: null,
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string);

    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: `Bearer ${KEY}`,
    });
    expect(body.model).toBe("test/model");
    expect(body.messages).toEqual([
      { role: "system", content: "system text" },
      { role: "user", content: "prompt text" },
    ]);
  });

  it("keeps a row when the provider refuses, so the failure is visible", async () => {
    fetchMock.mockResolvedValueOnce(reply({ error: "nope" }, 402));
    const project = await allowedProject();

    const result = await draft({
      kind: "chat_summary",
      system: "s",
      prompt: "p",
      projectId: project.id,
      userId: null,
    });

    expect(result).toMatchObject({ ok: false, failure: "provider" });

    const row = await db.aiUsage.findFirstOrThrow();
    expect(row.ok).toBe(false);
    expect(row.error).toContain("402");

    const stored = await db.studioSettings.findUniqueOrThrow({
      where: { id: "default" },
    });
    expect(stored.aiLastError).toContain("402");
  });

  it("treats an empty answer as a failure rather than an empty draft", async () => {
    fetchMock.mockResolvedValueOnce(
      reply({ choices: [{ message: { content: "   " } }] }),
    );
    const project = await allowedProject();

    expect(
      await draft({
        kind: "acceptance",
        system: "s",
        prompt: "p",
        projectId: project.id,
        userId: null,
      }),
    ).toMatchObject({ ok: false, failure: "empty" });
  });

  it("counts spend from successes and failures separately", async () => {
    const project = await allowedProject();
    const ask = () =>
      draft({
        kind: "acceptance",
        system: "s",
        prompt: "p",
        projectId: project.id,
        userId: null,
      });

    await ask();
    fetchMock.mockResolvedValueOnce(reply({}, 500));
    await ask();

    const spend = await aiSpend(new Date(Date.now() - 86_400_000));

    expect(spend.calls).toBe(1);
    expect(spend.failures).toBe(1);
    expect(spend.promptTokens).toBe(120);
    expect(spend.costUsd).toBeCloseTo(0.0042);
  });
});

describe("what the prompts carry", () => {
  it("gives the ticket its project's scope and nothing about people", () => {
    const { system, prompt } = acceptancePrompt({
      number: 14,
      title: "Fix the checkout",
      description: "Card payments fail on the second attempt.",
      type: "BUG",
      project: {
        key: "ACME",
        name: "Acme store",
        description: "A Shopify replacement.",
      },
    });

    expect(prompt).toContain("ACME-14");
    expect(prompt).toContain("Card payments fail");
    expect(prompt).toContain("A Shopify replacement.");
    expect(system).toContain("Never invent a fact");
    expect(system).toContain("Never state hours, prices, estimates");
  });

  it("says plainly when a ticket has no description instead of hiding it", () => {
    const { prompt } = acceptancePrompt({
      number: 1,
      title: "Something",
      description: null,
      type: "TASK",
      project: { key: "P", name: "P", description: null },
    });

    expect(prompt).toContain("(none written)");
  });

  it("marks internal notes in a thread so they are read as internal", () => {
    const { prompt } = chatSummaryPrompt({
      projectName: "Acme store",
      clientName: "Acme",
      messages: [
        {
          authorName: "John",
          isClient: true,
          isInternal: false,
          createdAt: new Date("2026-06-01"),
          body: "Any news?",
        },
        {
          authorName: "Dana",
          isClient: false,
          isInternal: true,
          createdAt: new Date("2026-06-02"),
          body: "Who is picking this up?",
        },
      ],
    });

    expect(prompt).toContain("John (client): Any news?");
    expect(prompt).toContain("Dana [internal]: Who is picking this up?");
  });

  it("never carries a contact's details out of an enquiry", () => {
    // The whole request row is handed over, contact fields and all, to prove
    // the builder drops them rather than relying on the caller to select.
    const { prompt } = requestDraftPrompt({
      title: "Online shop",
      description: "We need a shop.",
      companyName: "Acme",
      budgetNote: "around 10k",
      source: "Website form",
      contactName: "John Carter",
      contactEmail: "john@acme.com",
      contactPhone: "555-0100",
    } as Parameters<typeof requestDraftPrompt>[0]);

    // The company and the budget are about the work; the person is not.
    expect(prompt).toContain("Acme");
    expect(prompt).toContain("around 10k");
    expect(prompt).not.toContain("John Carter");
    expect(prompt).not.toContain("john@acme.com");
    expect(prompt).not.toContain("555-0100");
  });
});

describe("a different endpoint", () => {
  beforeEach(async () => {
    await resetDb();
    process.env.OPENROUTER_API_KEY = KEY;
    await settings({ aiEnabled: true, aiDefaultAllowed: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_BASE_URL;
  });

  it("goes wherever the operator points it, so a studio can keep it in-house", async () => {
    const fetchMock: ReturnType<typeof vi.fn> = vi.fn(async () =>
      answer("drafted"),
    );
    vi.stubGlobal("fetch", fetchMock);
    process.env.OPENROUTER_BASE_URL = "http://models.internal:8080/v1/";

    await draft({
      kind: "acceptance",
      system: "s",
      prompt: "p",
      projectId: null,
    });

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://models.internal:8080/v1/chat/completions");
  });
});
