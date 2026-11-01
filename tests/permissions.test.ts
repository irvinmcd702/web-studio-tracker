import { beforeAll, describe, expect, it } from "vitest";

import { canAccessProject, projectScope } from "../lib/permissions";
import { portalSettings } from "../lib/portal";
import {
  db,
  makeProject,
  makeTicket,
  makeUser,
  makeWorkflow,
  resetDb,
} from "./setup/db";

/**
 * Project visibility is the highest-stakes logic in the app: getting it wrong
 * shows one client another client's work.
 */
describe("project scope", () => {
  let admin: Awaited<ReturnType<typeof makeUser>>;
  let manager: Awaited<ReturnType<typeof makeUser>>;
  let member: Awaited<ReturnType<typeof makeUser>>;
  let outsider: Awaited<ReturnType<typeof makeUser>>;
  let clientUser: Awaited<ReturnType<typeof makeUser>>;
  let otherClientUser: Awaited<ReturnType<typeof makeUser>>;
  let orphanClientUser: Awaited<ReturnType<typeof makeUser>>;

  let workflowId: string;
  let acmeId: string;

  let managedProject: Awaited<ReturnType<typeof makeProject>>;
  let crewProject: Awaited<ReturnType<typeof makeProject>>;
  let assigneeProject: Awaited<ReturnType<typeof makeProject>>;
  let strangerProject: Awaited<ReturnType<typeof makeProject>>;
  let clientProject: Awaited<ReturnType<typeof makeProject>>;

  beforeAll(async () => {
    await resetDb();

    const acme = await db.client.create({ data: { name: "Acme" } });
    const other = await db.client.create({ data: { name: "Other" } });

    admin = await makeUser({ role: "ADMIN" });
    manager = await makeUser({ role: "MANAGER" });
    member = await makeUser({ role: "MEMBER" });
    outsider = await makeUser({ role: "MEMBER" });
    clientUser = await makeUser({ role: "CLIENT", clientId: acme.id });
    otherClientUser = await makeUser({ role: "CLIENT", clientId: other.id });
    orphanClientUser = await makeUser({ role: "CLIENT" });

    const workflow = await makeWorkflow();
    const statusId = workflow.statuses[0]!.id;
    workflowId = workflow.id;
    acmeId = acme.id;

    managedProject = await makeProject({
      workflowId: workflow.id,
      managerId: member.id,
    });

    crewProject = await makeProject({ workflowId: workflow.id });
    await db.projectMember.create({
      data: { projectId: crewProject.id, userId: member.id, role: "Frontend" },
    });

    assigneeProject = await makeProject({ workflowId: workflow.id });
    await makeTicket(assigneeProject.id, statusId, { assigneeId: member.id });

    strangerProject = await makeProject({ workflowId: workflow.id });

    clientProject = await makeProject({
      workflowId: workflow.id,
      clientId: acme.id,
    });
  });

  const idsFor = async (user: Parameters<typeof projectScope>[0]) =>
    (
      await db.project.findMany({
        where: projectScope(user),
        select: { id: true },
      })
    ).map((p) => p.id);

  it("lets an admin see every project", async () => {
    const ids = await idsFor(admin as never);
    expect(ids).toContain(strangerProject.id);
    expect(ids).toContain(clientProject.id);
  });

  it("lets a manager see every project", async () => {
    const ids = await idsFor(manager as never);
    expect(ids).toContain(strangerProject.id);
  });

  it("gives a member the projects they manage, crew, or hold a ticket on", async () => {
    const ids = await idsFor(member as never);
    expect(ids).toContain(managedProject.id);
    expect(ids).toContain(crewProject.id);
    expect(ids).toContain(assigneeProject.id);
    expect(ids).not.toContain(strangerProject.id);
    expect(ids).not.toContain(clientProject.id);
  });

  it("gives an unconnected member nothing", async () => {
    expect(await idsFor(outsider as never)).toHaveLength(0);
  });

  it("limits a client to their own company's projects", async () => {
    const ids = await idsFor(clientUser as never);
    expect(ids).toEqual([clientProject.id]);
  });

  it("shows another company's client nothing of ours", async () => {
    expect(await idsFor(otherClientUser as never)).toHaveLength(0);
  });

  it("shows a client with no company nothing at all", async () => {
    expect(await idsFor(orphanClientUser as never)).toHaveLength(0);
  });

  it("hides a closed project from a manager who is not on it", async () => {
    const closed = await makeProject({ workflowId: workflowId });
    await db.project.update({
      where: { id: closed.id },
      data: { isConfidential: true },
    });

    expect(await idsFor(manager as never)).not.toContain(closed.id);
    expect(await canAccessProject(manager as never, closed.id)).toBe(false);

    // Everything else the manager could see, they still can.
    expect(await idsFor(manager as never)).toContain(strangerProject.id);
  });

  it("still shows a closed project to a manager who is let in by name", async () => {
    const closed = await makeProject({ workflowId: workflowId });
    await db.project.update({
      where: { id: closed.id },
      data: { isConfidential: true },
    });
    await db.projectAccess.create({
      data: { projectId: closed.id, userId: manager.id },
    });

    expect(await idsFor(manager as never)).toContain(closed.id);
  });

  it("still shows a closed project to the people working on it", async () => {
    const closed = await makeProject({
      workflowId: workflowId,
      managerId: member.id,
    });
    await db.project.update({
      where: { id: closed.id },
      data: { isConfidential: true },
    });

    expect(await idsFor(member as never)).toContain(closed.id);
  });

  it("does not hide a closed project from an administrator", async () => {
    // Deliberate, and said out loud in the interface: they hold the database
    // and the backups, so a switch claiming otherwise would be a lie.
    const closed = await makeProject({ workflowId: workflowId });
    await db.project.update({
      where: { id: closed.id },
      data: { isConfidential: true },
    });

    expect(await idsFor(admin as never)).toContain(closed.id);
  });

  it("lets a member in by name without putting them on the crew", async () => {
    const closed = await makeProject({ workflowId: workflowId });
    await db.projectAccess.create({
      data: { projectId: closed.id, userId: outsider.id },
    });

    expect(await idsFor(outsider as never)).toContain(closed.id);
    // The point of the separate list: they are not counted as doing the work.
    const crew = await db.projectMember.count({
      where: { projectId: closed.id },
    });
    expect(crew).toBe(0);
  });

  it("keeps a closed project out of a client's portal only by company", async () => {
    // Closing is about the studio's own doors. The customer's project is
    // still theirs.
    const closed = await makeProject({
      workflowId: workflowId,
      clientId: acmeId,
    });
    await db.project.update({
      where: { id: closed.id },
      data: { isConfidential: true },
    });

    expect(await idsFor(clientUser as never)).toContain(closed.id);
    expect(await idsFor(otherClientUser as never)).not.toContain(closed.id);
  });

  it("agrees with canAccessProject", async () => {
    expect(await canAccessProject(member as never, crewProject.id)).toBe(true);
    expect(await canAccessProject(member as never, strangerProject.id)).toBe(
      false,
    );
    expect(await canAccessProject(clientUser as never, clientProject.id)).toBe(
      true,
    );
    expect(
      await canAccessProject(clientUser as never, strangerProject.id),
    ).toBe(false);
    expect(
      await canAccessProject(orphanClientUser as never, clientProject.id),
    ).toBe(false);
  });
});

/**
 * A crew is picked person by person. Teams are a directory to pick from, so a
 * project must never inherit access from one — that is the whole point of the
 * change away from attaching whole teams.
 */
describe("project crews", () => {
  it("does not give access to teammates of someone on the crew", async () => {
    await resetDb();

    const onCrew = await makeUser({ role: "MEMBER" });
    const teammate = await makeUser({ role: "MEMBER" });

    await db.team.create({
      data: {
        name: "Backend",
        members: {
          create: [{ userId: onCrew.id }, { userId: teammate.id }],
        },
      },
    });

    const project = await makeProject();
    await db.projectMember.create({
      data: { projectId: project.id, userId: onCrew.id },
    });

    expect(await canAccessProject(onCrew as never, project.id)).toBe(true);
    expect(await canAccessProject(teammate as never, project.id)).toBe(false);
  });

  it("lets one person be on several projects with a different role on each", async () => {
    await resetDb();

    const person = await makeUser({ role: "MEMBER" });
    const shop = await makeProject();
    const landing = await makeProject();

    await db.projectMember.createMany({
      data: [
        { projectId: shop.id, userId: person.id, role: "Backend" },
        { projectId: landing.id, userId: person.id, role: "Tech lead" },
      ],
    });

    const roles = await db.projectMember.findMany({
      where: { userId: person.id },
      orderBy: { role: "asc" },
      select: { role: true },
    });

    expect(roles.map((r) => r.role)).toEqual(["Backend", "Tech lead"]);
    expect(await canAccessProject(person as never, shop.id)).toBe(true);
    expect(await canAccessProject(person as never, landing.id)).toBe(true);
  });

  it("keeps a crew intact when the team it was picked from is deleted", async () => {
    await resetDb();

    const person = await makeUser({ role: "MEMBER" });
    const team = await db.team.create({
      data: { name: "Design", members: { create: [{ userId: person.id }] } },
    });
    const project = await makeProject();
    await db.projectMember.create({
      data: { projectId: project.id, userId: person.id, role: "UI" },
    });

    await db.team.delete({ where: { id: team.id } });

    expect(await canAccessProject(person as never, project.id)).toBe(true);
  });
});

describe("portal settings", () => {
  const base = {
    portalShowDescription: true,
    portalShowDueDate: true,
    portalShowTasks: true,
    portalShowChat: true,
    portalShowFiles: true,
    portalAllowUploads: true,
    portalShowHours: true,
    portalShowMoney: true,
    portalShowTeam: false,
    portalShowApprovals: true,
    portalShowDocs: false,
    portalShowAgentHours: false,
  };

  it("maps every flag through", () => {
    const settings = portalSettings(base as never);
    expect(settings.chat).toBe(true);
    expect(settings.team).toBe(false);
    expect(settings.approvals).toBe(true);
  });

  it("refuses uploads when the files section is off, however the flag is set", () => {
    const settings = portalSettings({
      ...base,
      portalShowFiles: false,
      portalAllowUploads: true,
    } as never);
    expect(settings.files).toBe(false);
    expect(settings.uploads).toBe(false);
  });
});
