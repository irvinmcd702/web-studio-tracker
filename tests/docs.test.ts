import { beforeAll, describe, expect, it } from "vitest";

import { canReadDoc, canWriteDocs, docExcerpt, docScope } from "../lib/docs";
import { db, makeProject, makeUser, resetDb } from "./setup/db";

/**
 * Docs carry briefs and access notes, so a leak here is as bad as a leak in the
 * ticket list — and there is an extra trapdoor: a doc can be shared with the
 * client while the project's portal has documents switched off.
 */
describe("doc scope", () => {
  let admin: Awaited<ReturnType<typeof makeUser>>;
  let member: Awaited<ReturnType<typeof makeUser>>;
  let outsider: Awaited<ReturnType<typeof makeUser>>;
  let clientUser: Awaited<ReturnType<typeof makeUser>>;
  let otherClientUser: Awaited<ReturnType<typeof makeUser>>;

  let studioDoc: { id: string };
  let sharedDoc: { id: string };
  let internalDoc: { id: string };
  let sharedButPortalOffDoc: { id: string };
  let otherClientDoc: { id: string };

  beforeAll(async () => {
    await resetDb();

    const acme = await db.client.create({ data: { name: "Acme" } });
    const other = await db.client.create({ data: { name: "Other" } });

    admin = await makeUser({ role: "ADMIN" });
    member = await makeUser({ role: "MEMBER" });
    outsider = await makeUser({ role: "MEMBER" });
    clientUser = await makeUser({ role: "CLIENT", clientId: acme.id });
    otherClientUser = await makeUser({ role: "CLIENT", clientId: other.id });

    const acmeProject = await makeProject({
      clientId: acme.id,
      managerId: member.id,
      portalShowDocs: true,
    });
    const acmeQuietProject = await makeProject({
      clientId: acme.id,
      managerId: member.id,
      portalShowDocs: false,
    });
    const otherProject = await makeProject({
      clientId: other.id,
      portalShowDocs: true,
    });

    studioDoc = await db.doc.create({
      data: { title: "Onboarding", body: "How we work" },
    });
    sharedDoc = await db.doc.create({
      data: {
        title: "Brief",
        body: "Scope",
        projectId: acmeProject.id,
        isClientVisible: true,
      },
    });
    internalDoc = await db.doc.create({
      data: {
        title: "Server access",
        body: "ssh notes",
        projectId: acmeProject.id,
      },
    });
    sharedButPortalOffDoc = await db.doc.create({
      data: {
        title: "Draft brief",
        body: "Scope",
        projectId: acmeQuietProject.id,
        isClientVisible: true,
      },
    });
    otherClientDoc = await db.doc.create({
      data: {
        title: "Other brief",
        body: "Scope",
        projectId: otherProject.id,
        isClientVisible: true,
      },
    });
  });

  const visible = async (user: Awaited<ReturnType<typeof makeUser>>) => {
    const docs = await db.doc.findMany({
      where: docScope(user),
      select: { id: true },
    });
    return docs.map((d) => d.id).sort();
  };

  it("shows an admin every doc", async () => {
    expect(await visible(admin)).toEqual(
      [
        studioDoc.id,
        sharedDoc.id,
        internalDoc.id,
        sharedButPortalOffDoc.id,
        otherClientDoc.id,
      ].sort(),
    );
  });

  it("shows a member studio docs plus docs on their own projects", async () => {
    expect(await visible(member)).toEqual(
      [
        studioDoc.id,
        sharedDoc.id,
        internalDoc.id,
        sharedButPortalOffDoc.id,
      ].sort(),
    );
  });

  it("shows an unrelated member only studio docs", async () => {
    expect(await visible(outsider)).toEqual([studioDoc.id]);
  });

  it("shows a client only shared docs on portals with docs enabled", async () => {
    expect(await visible(clientUser)).toEqual([sharedDoc.id]);
  });

  it("never shows a client another client's docs", async () => {
    const ids = await visible(otherClientUser);
    expect(ids).not.toContain(sharedDoc.id);
    expect(ids).toEqual([otherClientDoc.id]);
  });

  it("hides internal docs from the client they belong to", async () => {
    expect(await canReadDoc(clientUser, internalDoc.id)).toBe(false);
    expect(await canReadDoc(clientUser, studioDoc.id)).toBe(false);
    expect(await canReadDoc(clientUser, sharedDoc.id)).toBe(true);
  });

  it("hides a shared doc while the portal toggle is off", async () => {
    expect(await canReadDoc(clientUser, sharedButPortalOffDoc.id)).toBe(false);
  });

  it("lets staff write docs and clients not", () => {
    expect(canWriteDocs(admin)).toBe(true);
    expect(canWriteDocs(member)).toBe(true);
    expect(canWriteDocs(clientUser)).toBe(false);
  });
});

describe("docExcerpt", () => {
  it("skips blank lines", () => {
    expect(docExcerpt("\n\n   \nThe first real line")).toBe(
      "The first real line",
    );
  });

  it("skips a heading that would just repeat the title", () => {
    expect(docExcerpt("# Project brief\n\nAn online store for Acme")).toBe(
      "An online store for Acme",
    );
  });

  it("skips table rows", () => {
    expect(
      docExcerpt(
        "## Environments\n\n| Name | URL |\n| --- | --- |\n| Staging | x.com |\n\nCredentials live in the password manager",
      ),
    ).toBe("Credentials live in the password manager");
  });

  it("falls back to the heading when there is nothing else", () => {
    expect(docExcerpt("## Environments and access")).toBe(
      "Environments and access",
    );
  });

  it("strips list and quote markers", () => {
    expect(docExcerpt("- staging credentials")).toBe("staging credentials");
    expect(docExcerpt("> a quoted opening")).toBe("a quoted opening");
  });

  it("truncates long lines", () => {
    expect(docExcerpt("x".repeat(200))).toBe(`${"x".repeat(160)}…`);
  });

  it("returns null for an empty body", () => {
    expect(docExcerpt("")).toBeNull();
    expect(docExcerpt("\n   \n")).toBeNull();
  });
});
