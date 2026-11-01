import { beforeEach, describe, expect, it } from "vitest";

import { anonymiseUser, isAnonymised } from "../lib/anonymise";
import { exportFileName, exportPerson } from "../lib/data-export";
import {
  db,
  makeProject,
  makeTicket,
  makeUser,
  makeWorkflow,
  resetDb,
} from "./setup/db";

async function personWithWork() {
  const workflow = await makeWorkflow();
  const person = await makeUser({ name: "Dana Cole", position: "Backend" });
  const project = await makeProject({
    workflowId: workflow.id,
    status: "ACTIVE",
  });
  const ticket = await makeTicket(project.id, workflow.statuses[0]!.id, {
    assigneeId: person.id,
  });

  await db.workLog.create({
    data: {
      ticketId: ticket.id,
      userId: person.id,
      hours: 12,
      spentOn: new Date(),
    },
  });
  await db.ticketComment.create({
    data: { ticketId: ticket.id, authorId: person.id, body: "Deployed it." },
  });
  await db.chatMessage.create({
    data: {
      projectId: project.id,
      authorId: person.id,
      body: "Ready for review.",
    },
  });
  await db.attachment.create({
    data: {
      fileName: "stored-name.png",
      originalName: "screenshot.png",
      mimeType: "image/png",
      size: 1024,
      uploadedById: person.id,
      projectId: project.id,
    },
  });

  return { person, project, ticket };
}

describe("erasing a person", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("removes everything that names them", async () => {
    const admin = await makeUser({ role: "ADMIN" });
    const { person } = await personWithWork();

    const result = await anonymiseUser({
      userId: person.id,
      actorId: admin.id,
    });
    expect(result.ok).toBe(true);

    const after = await db.user.findUniqueOrThrow({ where: { id: person.id } });

    expect(after.name).toBe("Former colleague");
    expect(after.email).not.toContain("user-");
    expect(after.email).toMatch(/@anonymised\.invalid$/);
    expect(after.position).toBeNull();
    expect(after.handle).toBe(result.ok ? result.handle : "");
    expect(after.gitLogin).toBeNull();
    expect(after.isActive).toBe(false);
    expect(isAnonymised(after)).toBe(true);
  });

  it("keeps the work, because it is the client's record and not the person's", async () => {
    const admin = await makeUser({ role: "ADMIN" });
    const { person, ticket } = await personWithWork();

    await anonymiseUser({ userId: person.id, actorId: admin.id });

    // The hours on an invoice do not disappear because someone left.
    const hours = await db.workLog.aggregate({
      where: { userId: person.id },
      _sum: { hours: true },
    });
    expect(hours._sum.hours).toBe(12);

    expect(
      await db.ticketComment.count({ where: { authorId: person.id } }),
    ).toBe(1);
    expect(await db.chatMessage.count({ where: { authorId: person.id } })).toBe(
      1,
    );
    expect(
      await db.attachment.count({ where: { uploadedById: person.id } }),
    ).toBe(1);
    // And the ticket still knows who it was assigned to, nameless though it is.
    const stillAssigned = await db.ticket.findUniqueOrThrow({
      where: { id: ticket.id },
    });
    expect(stillAssigned.assigneeId).toBe(person.id);
  });

  it("reports what survived instead of promising it", async () => {
    const admin = await makeUser({ role: "ADMIN" });
    const { person } = await personWithWork();

    const result = await anonymiseUser({
      userId: person.id,
      actorId: admin.id,
    });

    expect(result).toMatchObject({
      ok: true,
      kept: { workLogs: 1, comments: 1, chatMessages: 1, uploads: 1 },
    });
  });

  it("closes every way back into the account", async () => {
    const admin = await makeUser({ role: "ADMIN" });
    const person = await makeUser();
    const before = person.passwordHash;

    await db.authToken.create({
      data: {
        userId: person.id,
        kind: "RESET",
        tokenHash: "hash-1",
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    await db.apiToken.create({
      data: {
        userId: person.id,
        name: "agent",
        tokenHash: "hash-2",
        prefix: "st_abc",
      },
    });

    await anonymiseUser({ userId: person.id, actorId: admin.id });

    expect(await db.authToken.count({ where: { userId: person.id } })).toBe(0);
    expect(await db.apiToken.count({ where: { userId: person.id } })).toBe(0);

    const after = await db.user.findUniqueOrThrow({ where: { id: person.id } });
    expect(after.passwordHash).not.toBe(before);
    // Sessions issued before this moment are rejected on their next request.
    expect(after.passwordChangedAt).not.toBeNull();
  });

  it("cuts a portal user loose from the customer", async () => {
    const admin = await makeUser({ role: "ADMIN" });
    const client = await db.client.create({ data: { name: "Acme" } });
    const contact = await makeUser({ role: "CLIENT", clientId: client.id });

    await anonymiseUser({ userId: contact.id, actorId: admin.id });

    const after = await db.user.findUniqueOrThrow({
      where: { id: contact.id },
    });
    expect(after.clientId).toBeNull();
    expect(after.name).toBe("Former contact");
  });

  it("records that it happened without writing back what it erased", async () => {
    const admin = await makeUser({ role: "ADMIN" });
    const person = await makeUser({ name: "Dana Cole" });
    const email = person.email;

    const result = await anonymiseUser({
      userId: person.id,
      actorId: admin.id,
    });

    const entry = await db.activity.findFirstOrThrow({
      where: { type: "user.anonymised" },
    });
    expect(entry.userId).toBe(admin.id);
    expect(entry.message).not.toContain("Dana Cole");
    expect(entry.message).not.toContain(email);
    if (result.ok) expect(entry.message).toContain(result.handle);
  });

  it("refuses to let someone erase themselves", async () => {
    const admin = await makeUser({ role: "ADMIN" });

    const result = await anonymiseUser({
      userId: admin.id,
      actorId: admin.id,
    });

    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error).toContain("another administrator");
  });

  it("refuses to erase the last administrator", async () => {
    const only = await makeUser({ role: "ADMIN" });
    const other = await makeUser({ role: "MANAGER" });

    const result = await anonymiseUser({
      userId: only.id,
      actorId: other.id,
    });

    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error).toContain("last active administrator");
  });

  it("refuses to do it twice", async () => {
    const admin = await makeUser({ role: "ADMIN" });
    const person = await makeUser();

    await anonymiseUser({ userId: person.id, actorId: admin.id });
    const second = await anonymiseUser({
      userId: person.id,
      actorId: admin.id,
    });

    expect(second).toMatchObject({ ok: false });
    if (!second.ok) expect(second.error).toContain("already been erased");
  });
});

describe("exporting a person", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("carries the work they did and the words they wrote", async () => {
    const { person, project } = await personWithWork();

    const data = await exportPerson(person.id);
    const json = JSON.stringify(data);

    expect(json).toContain("Dana Cole");
    expect(json).toContain("Deployed it.");
    expect(json).toContain("Ready for review.");
    expect(json).toContain("screenshot.png");
    expect(json).toContain(project.key);
    expect((data!.work as { workLogs: unknown[] }).workLogs).toHaveLength(1);
  });

  it("never carries a hash out of the database", async () => {
    // A distinctive hash: the fixture default is a single character, which
    // would match anywhere in the document and prove nothing.
    const person = await makeUser({ passwordHash: "secret-password-hash" });
    await db.authToken.create({
      data: {
        userId: person.id,
        kind: "INVITE",
        tokenHash: "secret-auth-hash",
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    await db.apiToken.create({
      data: {
        userId: person.id,
        name: "agent",
        tokenHash: "secret-api-hash",
        prefix: "st_abc",
      },
    });

    const json = JSON.stringify(await exportPerson(person.id));

    expect(json).not.toContain("secret-auth-hash");
    expect(json).not.toContain("secret-api-hash");
    expect(json).not.toContain("passwordHash");
    // The person's own password hash is the one that matters most.
    expect(json).not.toContain(person.passwordHash);
  });

  it("includes the contact details held against a portal user's company", async () => {
    const client = await db.client.create({
      data: {
        name: "Acme",
        contactName: "John Carter",
        email: "john@acme.com",
      },
    });
    const contact = await makeUser({ role: "CLIENT", clientId: client.id });

    const json = JSON.stringify(await exportPerson(contact.id));

    expect(json).toContain("John Carter");
    expect(json).toContain("john@acme.com");
  });

  it("says what it cannot answer", async () => {
    const person = await makeUser();
    const data = await exportPerson(person.id);

    const limits = data!.about.limits.join(" ");
    expect(limits).toContain("Text other people wrote is not included");
    expect(limits).toContain("Backups");
  });

  it("is nothing at all for someone who does not exist", async () => {
    expect(await exportPerson("no-such-person")).toBeNull();
  });

  it("names the file after the person and the day", () => {
    expect(exportFileName("Dana Cole", new Date("2026-08-05T10:00:00Z"))).toBe(
      "studio-tracker-dana-cole-2026-08-05.json",
    );
    expect(exportFileName("Владимир", new Date("2026-08-05T10:00:00Z"))).toBe(
      "studio-tracker-person-2026-08-05.json",
    );
  });
});

describe("the two together", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("leaves an export with nothing personal left in it", async () => {
    const admin = await makeUser({ role: "ADMIN" });
    const { person } = await personWithWork();
    const email = person.email;

    await anonymiseUser({ userId: person.id, actorId: admin.id });

    const json = JSON.stringify(await exportPerson(person.id));

    expect(json).not.toContain("Dana Cole");
    expect(json).not.toContain(email);
    expect(json).not.toContain("Backend");
    // But the work is still described, which is the point of keeping the row.
    expect(json).toContain("Deployed it.");
  });
});
