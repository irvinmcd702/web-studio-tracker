import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";

import { prisma } from "./db";
import { handleShape } from "./mentions";

/**
 * A studio's worth of plausible work, for showing people how this is meant to
 * be used.
 *
 * Separate from `prisma/seed.ts` on purpose. That one wipes the database and
 * gives everybody the password `admin123`, which is right for a laptop and
 * wrong for anything with a public address. This one:
 *
 * - **adds, never deletes** — it cannot take an existing account with it;
 * - **refuses the moment a project it does not own exists**, so it can never
 *   land on top of real work, whatever the variable says. Within its own five
 *   projects it is resumable: a run that failed halfway finishes on the next
 *   start rather than leaving a half-built studio nobody can repair;
 * - gives the demo accounts one **generated** password, printed once to the
 *   log, so a presenter can switch between roles without a shared secret that
 *   anybody could guess from the internet.
 *
 * The content is arranged to demonstrate rather than to fill space: four
 * workflows from three statuses to a full release process, projects at
 * different stages of health, a client who has been waiting two days for an
 * answer, and a budget under pressure — so the dashboard has something to say
 * the moment it is opened.
 */

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);
const ahead = (days: number) => new Date(Date.now() + days * DAY);

/**
 * The projects this seed owns. Nothing outside this list is ever touched, and
 * the presence of anything outside it stops the seed entirely.
 */
const DEMO_KEYS = ["ACME", "NW", "BAKE", "VER", "ACMEAPP"];

export async function seedDemoData() {
  if (process.env.SEED_DEMO_DATA !== "true") return;

  let foreign: number;
  try {
    // The guard is "somebody else's work exists", not "any work exists". A run
    // that failed halfway should be able to finish on the next start; a run
    // that would land on a real project must still refuse.
    foreign = await prisma.project.count({
      where: { key: { notIn: DEMO_KEYS } },
    });
  } catch (e) {
    console.warn("[demo] could not check for existing projects:", e);
    return;
  }

  if (foreign > 0) {
    console.log(
      `[demo] ${foreign} project(s) that this seed does not own already exist — doing nothing.`,
    );
    return;
  }

  const password =
    process.env.DEMO_PASSWORD?.trim() ||
    `demo-${randomBytes(6).toString("hex")}`;
  const hash = await bcrypt.hash(password, 10);

  const person = (
    email: string,
    name: string,
    role: "ADMIN" | "MANAGER" | "MEMBER",
    position: string,
    avatarColor: string,
  ) =>
    prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        handle: handleShape(email.split("@")[0] ?? email),
        name,
        role,
        position,
        avatarColor,
        passwordHash: hash,
      },
    });

  // --- People -------------------------------------------------------------

  const [pm, pm2, dev, backend, designer, qa] = await Promise.all([
    person(
      "maria@demo.studio",
      "Maria Kovacs",
      "MANAGER",
      "Project manager",
      "#7c3aed",
    ),
    person(
      "tom@demo.studio",
      "Tom Berger",
      "MANAGER",
      "Project manager",
      "#0891b2",
    ),
    person(
      "dana@demo.studio",
      "Dana Cole",
      "MEMBER",
      "Frontend developer",
      "#2563eb",
    ),
    person(
      "sam@demo.studio",
      "Sam Ortiz",
      "MEMBER",
      "Backend developer",
      "#16a34a",
    ),
    person("lea@demo.studio", "Lea Fontaine", "MEMBER", "Designer", "#ec4899"),
    person(
      "ivan@demo.studio",
      "Ivan Petrov",
      "MEMBER",
      "QA engineer",
      "#d97706",
    ),
  ]);

  const teams = await Promise.all([
    prisma.team.upsert({
      where: { name: "Frontend" },
      update: {},
      create: {
        name: "Frontend",
        color: "#2563eb",
        description: "React, Next.js",
      },
    }),
    prisma.team.upsert({
      where: { name: "Backend" },
      update: {},
      create: {
        name: "Backend",
        color: "#16a34a",
        description: "APIs, databases",
      },
    }),
    prisma.team.upsert({
      where: { name: "Design" },
      update: {},
      create: { name: "Design", color: "#ec4899", description: "UI and brand" },
    }),
  ]);

  await prisma.teamMember.createMany({
    skipDuplicates: true,
    data: [
      { teamId: teams[0]!.id, userId: dev.id, title: "Tech lead" },
      { teamId: teams[1]!.id, userId: backend.id },
      { teamId: teams[2]!.id, userId: designer.id, title: "Art direction" },
      { teamId: teams[0]!.id, userId: qa.id, title: "QA" },
    ],
  });

  // --- Clients ------------------------------------------------------------

  const client = (
    name: string,
    contactName: string,
    email: string,
    website: string,
    notes: string,
  ) =>
    prisma.client.upsert({
      where: { id: `demo-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` },
      update: {},
      create: {
        id: `demo-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        name,
        contactName,
        email,
        website,
        notes,
        phone: "+1 555 0100",
      },
    });

  const [acme, northwind, bakery, veridian] = await Promise.all([
    client(
      "Acme Retail",
      "John Carter",
      "john@acme.example",
      "https://acme.example",
      "Replacing a Shopify storefront. Wants weekly demos.",
    ),
    client(
      "Northwind SaaS",
      "Priya Nair",
      "priya@northwind.example",
      "https://northwind.example",
      "Series A. Design-led; the founder reviews everything.",
    ),
    client(
      "Corner Bakery",
      "Ana Lopez",
      "ana@bakery.example",
      "https://bakery.example",
      "Small fixed-price site. First time working with an agency.",
    ),
    client(
      "Veridian Group",
      "Mark Ellis",
      "mark@veridian.example",
      "https://veridian.example",
      "Long-standing retainer. Several small projects a year.",
    ),
  ]);

  const portalUser = (email: string, name: string, clientId: string) =>
    prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        handle: handleShape(email.split("@")[0] ?? email),
        name,
        role: "CLIENT",
        clientId,
        passwordHash: hash,
        avatarColor: "#64748b",
      },
    });

  await Promise.all([
    portalUser("john@acme.example", "John Carter", acme.id),
    portalUser("priya@northwind.example", "Priya Nair", northwind.id),
    portalUser("ana@bakery.example", "Ana Lopez", bakery.id),
  ]);

  // --- Workflows, simplest first ------------------------------------------

  type StatusSpec = {
    name: string;
    category: "TODO" | "IN_PROGRESS" | "DONE";
    color: string;
  };

  async function makeWorkflow(
    name: string,
    description: string,
    statuses: StatusSpec[],
    isDefault = false,
  ) {
    const existing = await prisma.workflow.findUnique({
      where: { name },
      include: { statuses: { orderBy: { position: "asc" } } },
    });
    if (existing) return existing;

    return prisma.workflow.create({
      data: {
        name,
        description,
        isDefault,
        statuses: {
          create: statuses.map((s, i) => ({
            ...s,
            position: i,
            isInitial: i === 0,
            // Laid out in two rows so the canvas opens readable.
            canvasX: (i % 4) * 260,
            canvasY: Math.floor(i / 4) * 170,
          })),
        },
      },
      include: { statuses: { orderBy: { position: "asc" } } },
    });
  }

  /** Straight line A → B → C. Skips what is already drawn, so a resumed run
   *  does not collide with the unique constraint on an arrow. */
  async function chain(
    workflowId: string,
    statuses: { id: string; name: string }[],
    names: string[],
  ) {
    await prisma.workflowTransition.createMany({
      skipDuplicates: true,
      data: statuses.slice(0, -1).map((from, i) => ({
        workflowId,
        fromStatusId: from.id,
        toStatusId: statuses[i + 1]!.id,
        name: names[i] ?? `To ${statuses[i + 1]!.name}`,
      })),
    });
  }

  const simple = await makeWorkflow(
    "1 · Simple",
    "Three statuses and nothing in the way. Where a small job starts.",
    [
      { name: "To do", category: "TODO", color: "#64748b" },
      { name: "Doing", category: "IN_PROGRESS", color: "#2563eb" },
      { name: "Done", category: "DONE", color: "#16a34a" },
    ],
  );
  await chain(simple.id, simple.statuses, ["Start", "Finish"]);

  const withReview = await makeWorkflow(
    "2 · With review",
    "Adds a review step, and the first rule: you cannot review your own work into Done without an assignee.",
    [
      { name: "To do", category: "TODO", color: "#64748b" },
      { name: "In progress", category: "IN_PROGRESS", color: "#2563eb" },
      { name: "Review", category: "IN_PROGRESS", color: "#7c3aed" },
      { name: "Done", category: "DONE", color: "#16a34a" },
    ],
  );
  await chain(withReview.id, withReview.statuses, [
    "Start work",
    "Send to review",
    "Approve",
  ]);
  await prisma.workflowTransition.updateMany({
    where: {
      workflowId: withReview.id,
      fromStatusId: withReview.statuses[0]!.id,
      toStatusId: withReview.statuses[1]!.id,
    },
    data: { hooks: { assignToActor: true } },
  });
  await prisma.workflowTransition.updateMany({
    where: {
      workflowId: withReview.id,
      fromStatusId: withReview.statuses[1]!.id,
      toStatusId: withReview.statuses[2]!.id,
    },
    data: { conditions: { requireAssignee: true, requireDescription: true } },
  });
  // Review can always push back.
  await prisma.workflowTransition.createMany({
    skipDuplicates: true,
    data: [
      {
        workflowId: withReview.id,
        fromStatusId: withReview.statuses[2]!.id,
        toStatusId: withReview.statuses[1]!.id,
        name: "Changes needed",
        hooks: { postComment: "Sent back from review." },
      },
    ],
  });

  const full = await makeWorkflow(
    "3 · Full development",
    "The real one: estimates before review, acceptance criteria before QA, and only a manager may release.",
    [
      { name: "Backlog", category: "TODO", color: "#94a3b8" },
      { name: "Specced", category: "TODO", color: "#64748b" },
      { name: "In development", category: "IN_PROGRESS", color: "#2563eb" },
      { name: "Code review", category: "IN_PROGRESS", color: "#7c3aed" },
      { name: "QA", category: "IN_PROGRESS", color: "#d97706" },
      { name: "Client approval", category: "IN_PROGRESS", color: "#0891b2" },
      { name: "Released", category: "DONE", color: "#16a34a" },
    ],
    true,
  );
  await chain(full.id, full.statuses, [
    "Spec it",
    "Start work",
    "Send to review",
    "Pass to QA",
    "Show the client",
    "Release",
  ]);
  const fullRule = (from: number, to: number, data: object) =>
    prisma.workflowTransition.updateMany({
      where: {
        workflowId: full.id,
        fromStatusId: full.statuses[from]!.id,
        toStatusId: full.statuses[to]!.id,
      },
      data,
    });
  await fullRule(1, 2, { hooks: { assignToActor: true } });
  await fullRule(2, 3, {
    conditions: {
      assigneeOnly: true,
      requireEstimate: true,
      requireDescription: true,
    },
  });
  await fullRule(3, 4, { conditions: { requireAcceptance: true } });
  await fullRule(4, 5, {
    hooks: { setClientVisible: true, postComment: "Ready for you to look at." },
  });
  await fullRule(5, 6, {
    conditions: { roles: ["ADMIN", "MANAGER"], requireComment: true },
    hooks: { notifyChat: true },
  });
  // `skipDuplicates` cannot help here: the unique index covers `fromStatusId`,
  // and Postgres treats two NULLs as different values, so a catch-all arrow
  // would be inserted again on every run. Ask first.
  const catchAll = await prisma.workflowTransition.findFirst({
    where: { workflowId: full.id, fromStatusId: null },
  });
  if (!catchAll) {
    await prisma.workflowTransition.create({
      data: {
        workflowId: full.id,
        fromStatusId: null,
        toStatusId: full.statuses[0]!.id,
        name: "Drop back to backlog",
        hooks: { clearAssignee: true, setClientVisible: false },
      },
    });
  }

  const design = await makeWorkflow(
    "4 · Design",
    "A different shape entirely: rounds of revision with the client, not a straight line.",
    [
      { name: "Brief", category: "TODO", color: "#94a3b8" },
      { name: "Concept", category: "IN_PROGRESS", color: "#ec4899" },
      { name: "Internal review", category: "IN_PROGRESS", color: "#7c3aed" },
      { name: "With the client", category: "IN_PROGRESS", color: "#0891b2" },
      { name: "Revisions", category: "IN_PROGRESS", color: "#d97706" },
      { name: "Approved", category: "DONE", color: "#16a34a" },
    ],
  );
  await chain(design.id, design.statuses, [
    "Start concept",
    "Show the team",
    "Send to client",
    "Client asked for changes",
    "Approved",
  ]);
  await prisma.workflowTransition.createMany({
    data: [
      {
        workflowId: design.id,
        fromStatusId: design.statuses[4]!.id,
        toStatusId: design.statuses[3]!.id,
        name: "Send again",
      },
      {
        workflowId: design.id,
        fromStatusId: design.statuses[3]!.id,
        toStatusId: design.statuses[5]!.id,
        name: "Client approved",
      },
    ],
    skipDuplicates: true,
  });

  // --- Projects -----------------------------------------------------------

  const project = (data: Record<string, unknown>) =>
    prisma.project.upsert({
      where: { key: data.key as string },
      update: {},
      create: {
        portalShowDescription: true,
        portalShowDueDate: true,
        portalShowTasks: true,
        portalShowChat: true,
        portalShowFiles: true,
        portalShowHours: true,
        portalShowMoney: true,
        portalShowApprovals: true,
        ...data,
      } as never,
    });

  const shop = await project({
    key: "ACME",
    name: "Acme online store",
    description:
      "Replacing a Shopify storefront with a bespoke one: catalogue, basket, checkout and a warehouse integration.",
    status: "ACTIVE",
    workflowId: full.id,
    clientId: acme.id,
    managerId: pm.id,
    startDate: ago(45),
    dueDate: ahead(18),
    budgetType: "HOURLY",
    budgetHours: 320,
    hourlyRate: 65,
    currency: "EUR",
  });

  const saas = await project({
    key: "NW",
    name: "Northwind onboarding redesign",
    description:
      "Rebuilding the sign-up and first-run experience. Design-led, three rounds of review agreed.",
    status: "ACTIVE",
    workflowId: design.id,
    clientId: northwind.id,
    managerId: pm2.id,
    startDate: ago(20),
    dueDate: ahead(35),
    budgetType: "HOURLY",
    budgetHours: 140,
    hourlyRate: 80,
    currency: "EUR",
  });

  const site = await project({
    key: "BAKE",
    name: "Corner Bakery website",
    description:
      "Five pages, an order form and a map. Fixed price, agreed up front.",
    status: "ACTIVE",
    workflowId: simple.id,
    clientId: bakery.id,
    managerId: pm.id,
    startDate: ago(10),
    dueDate: ahead(6),
    budgetType: "FIXED",
    fixedAmount: 4200,
    currency: "EUR",
  });

  const retainer = await project({
    key: "VER",
    name: "Veridian — Q3 improvements",
    description:
      "Rolling small work: performance, accessibility, content tools.",
    status: "ACTIVE",
    workflowId: withReview.id,
    clientId: veridian.id,
    managerId: pm2.id,
    startDate: ago(60),
    budgetType: "HOURLY",
    budgetHours: 80,
    hourlyRate: 70,
    currency: "EUR",
  });

  const paused = await project({
    key: "ACMEAPP",
    name: "Acme mobile app",
    description: "Phase two. On hold until the store is live.",
    status: "ON_HOLD",
    workflowId: full.id,
    clientId: acme.id,
    managerId: pm.id,
    budgetType: "HOURLY",
    budgetHours: 200,
    hourlyRate: 65,
    currency: "EUR",
  });

  await prisma.projectMember.createMany({
    skipDuplicates: true,
    data: [
      { projectId: shop.id, userId: dev.id, role: "Frontend" },
      { projectId: shop.id, userId: backend.id, role: "Backend" },
      { projectId: shop.id, userId: qa.id, role: "QA" },
      { projectId: saas.id, userId: designer.id, role: "Design lead" },
      { projectId: saas.id, userId: dev.id, role: "Frontend" },
      { projectId: site.id, userId: dev.id, role: "Everything" },
      { projectId: retainer.id, userId: backend.id, role: "Backend" },
      { projectId: retainer.id, userId: qa.id, role: "QA" },
      { projectId: paused.id, userId: dev.id, role: "Frontend" },
    ],
  });

  // --- Tickets ------------------------------------------------------------

  // Everything from here down is content rather than structure, and none of it
  // has a natural key to upsert on. One check covers the lot: if the tickets
  // are already there, so is the rest, and a second run would only duplicate.
  if ((await prisma.ticket.count()) > 0) {
    console.log(
      "[demo] tickets already present — structure only, nothing added.",
    );
    return;
  }

  const counter: Record<string, number> = {};
  async function ticket(
    p: { id: string; key: string },
    statusId: string,
    data: Record<string, unknown>,
  ) {
    counter[p.key] = (counter[p.key] ?? 0) + 1;
    return prisma.ticket.create({
      data: {
        projectId: p.id,
        statusId,
        number: counter[p.key]!,
        ...data,
      } as never,
    });
  }

  const s = (w: typeof full, i: number) => w.statuses[i]!.id;

  const checkout = await ticket(shop, s(full, 4), {
    title: "Card payments fail on the second attempt",
    description:
      "A declined card leaves the basket in a state the customer cannot recover from without clearing cookies.",
    acceptance:
      "- [ ] A declined payment returns to the basket with its contents intact\n- [ ] The customer can try a different card without starting over\n- [ ] The failure is recorded against the order attempt",
    type: "BUG",
    priority: "URGENT",
    estimate: 6,
    dueDate: ago(2),
    assigneeId: backend.id,
    reporterId: pm.id,
    isClientVisible: true,
  });

  const warehouse = await ticket(shop, s(full, 2), {
    title: "Warehouse stock sync",
    description:
      "Hourly pull from the warehouse API; out-of-stock items hidden rather than removed.",
    acceptance:
      "- [ ] Stock counts refresh at least hourly\n- [ ] An item that goes out of stock disappears from the catalogue within one cycle\n- [ ] A failed sync leaves the previous counts and raises an alert",
    type: "FEATURE",
    priority: "HIGH",
    estimate: 20,
    dueDate: ahead(5),
    assigneeId: backend.id,
    reporterId: pm.id,
  });

  const catalogue = await ticket(shop, s(full, 3), {
    title: "Catalogue filtering by size and colour",
    description: "Filters combine; the URL is shareable.",
    acceptance:
      "- [ ] Filters combine\n- [ ] The URL reflects the selection\n- [ ] Clearing one filter keeps the others",
    type: "FEATURE",
    priority: "MEDIUM",
    estimate: 14,
    assigneeId: dev.id,
    reporterId: pm.id,
    isClientVisible: true,
  });

  await ticket(shop, s(full, 6), {
    title: "Product page layout",
    description: "Gallery, description, size picker, add to basket.",
    type: "TASK",
    priority: "MEDIUM",
    estimate: 12,
    assigneeId: dev.id,
    reporterId: pm.id,
    isClientVisible: true,
  });

  await ticket(shop, s(full, 0), {
    title: "Gift cards",
    description: "Raised by the client in passing; not specced or priced yet.",
    type: "FEATURE",
    priority: "LOW",
    reporterId: pm.id,
  });

  const stalled = await ticket(shop, s(full, 2), {
    title: "Address autocomplete at checkout",
    description: "Third-party lookup, with a manual fallback.",
    type: "TASK",
    priority: "MEDIUM",
    estimate: 8,
    assigneeId: dev.id,
    reporterId: pm.id,
    // Untouched for a week: this is what "stalled" looks like on the dashboard.
    updatedAt: ago(7),
  });

  await ticket(saas, s(design, 3), {
    title: "Sign-up flow — concept B",
    description: "Three screens instead of five, with progress shown.",
    type: "TASK",
    priority: "HIGH",
    estimate: 16,
    assigneeId: designer.id,
    reporterId: pm2.id,
    isClientVisible: true,
    dueDate: ahead(1),
  });

  await ticket(saas, s(design, 4), {
    title: "Empty states for the dashboard",
    description:
      "The founder asked for something warmer than the current blank panels.",
    type: "TASK",
    priority: "MEDIUM",
    estimate: 6,
    assigneeId: designer.id,
    reporterId: pm2.id,
  });

  await ticket(saas, s(design, 1), {
    title: "Icon set",
    type: "TASK",
    priority: "LOW",
    estimate: 10,
    assigneeId: designer.id,
    reporterId: pm2.id,
  });

  await ticket(site, s(simple, 1), {
    title: "Order form",
    description:
      "Name, phone, pickup time, and a note. Sends to the shop's inbox.",
    type: "FEATURE",
    priority: "HIGH",
    estimate: 8,
    assigneeId: dev.id,
    reporterId: pm.id,
    dueDate: ahead(2),
    isClientVisible: true,
  });
  await ticket(site, s(simple, 2), {
    title: "Homepage",
    type: "TASK",
    priority: "MEDIUM",
    estimate: 10,
    assigneeId: dev.id,
    reporterId: pm.id,
    isClientVisible: true,
  });
  await ticket(site, s(simple, 0), {
    title: "Map and opening hours",
    type: "TASK",
    priority: "LOW",
    estimate: 3,
    reporterId: pm.id,
  });

  await ticket(retainer, s(withReview, 2), {
    title: "Cut the largest images down",
    description: "The category pages ship 4 MB of images.",
    type: "CHORE",
    priority: "MEDIUM",
    estimate: 5,
    assigneeId: backend.id,
    reporterId: pm2.id,
  });
  await ticket(retainer, s(withReview, 0), {
    title: "Keyboard traps in the filter panel",
    description: "Found during an accessibility pass.",
    type: "BUG",
    priority: "HIGH",
    estimate: 4,
    reporterId: qa.id,
  });

  await ticket(paused, s(full, 0), {
    title: "Pick the framework",
    type: "TASK",
    priority: "MEDIUM",
    reporterId: pm.id,
  });

  // --- Time, which is what makes the budget real --------------------------

  const log = (
    ticketId: string,
    userId: string,
    hours: number,
    days: number,
    description: string,
  ) =>
    prisma.workLog.create({
      data: { ticketId, userId, hours, spentOn: ago(days), description },
    });

  await Promise.all([
    log(
      checkout.id,
      backend.id,
      4.5,
      3,
      "Reproduced it; the retry loses the session",
    ),
    log(checkout.id, backend.id, 3, 1, "Fix and a regression test"),
    log(warehouse.id, backend.id, 12, 6, "Sync worker and the mapping"),
    log(warehouse.id, backend.id, 6.5, 2, "Error handling for a failed pull"),
    log(catalogue.id, dev.id, 9, 4, "Filter state in the URL"),
    log(catalogue.id, dev.id, 5, 2, "Mobile layout"),
    log(stalled.id, dev.id, 2, 9, "Looked at two providers"),
  ]);

  // Enough hours on the retainer to put the budget under visible pressure.
  const retainerTicket = await prisma.ticket.findFirstOrThrow({
    where: { projectId: retainer.id },
  });
  await prisma.workLog.createMany({
    data: Array.from({ length: 8 }, (_, i) => ({
      ticketId: retainerTicket.id,
      userId: i % 2 ? backend.id : qa.id,
      hours: 8,
      spentOn: ago(50 - i * 6),
      description: "Retainer work",
    })),
  });

  // --- Comments, chat, approvals, docs ------------------------------------

  await prisma.ticketComment.createMany({
    data: [
      {
        ticketId: checkout.id,
        authorId: qa.id,
        body: "Reproduced on staging with a test card that declines. Basket is empty afterwards.",
        createdAt: ago(3),
      },
      {
        ticketId: checkout.id,
        authorId: backend.id,
        body: "The retry creates a new session and drops the basket. Fixing the session handling rather than the retry.",
        createdAt: ago(2),
      },
      {
        ticketId: warehouse.id,
        authorId: pm.id,
        body: "The client confirmed hourly is enough — no need for a webhook.",
        createdAt: ago(5),
      },
      {
        ticketId: catalogue.id,
        authorId: dev.id,
        body: "Ready for review. Combined filters were the fiddly part.",
        createdAt: ago(1),
      },
    ],
  });

  await prisma.chatMessage.createMany({
    data: [
      {
        projectId: shop.id,
        authorId: pm.id,
        body: "Morning John — the product page is on staging, link in the files section.",
        createdAt: ago(6),
      },
      {
        projectId: shop.id,
        authorId: (
          await prisma.user.findUniqueOrThrow({
            where: { email: "john@acme.example" },
          })
        ).id,
        body: "Looks good. One thing: can the size picker remember what I chose last time?",
        createdAt: ago(5),
      },
      {
        projectId: shop.id,
        authorId: pm.id,
        body: "It can. I'll price it and come back to you.",
        createdAt: ago(5),
      },
      {
        projectId: shop.id,
        authorId: pm.id,
        body: "Internal: Dana, roughly how long for the size memory?",
        isInternal: true,
        createdAt: ago(4),
      },
      // Left unanswered on purpose: the dashboard notices, which is the point.
      {
        projectId: shop.id,
        authorId: (
          await prisma.user.findUniqueOrThrow({
            where: { email: "john@acme.example" },
          })
        ).id,
        body: "Any news on the size picker? We'd like it before launch.",
        createdAt: ago(2),
      },
      {
        projectId: saas.id,
        authorId: pm2.id,
        body: "Concept B is with you — three screens rather than five.",
        createdAt: ago(3),
      },
      {
        projectId: saas.id,
        authorId: (
          await prisma.user.findUniqueOrThrow({
            where: { email: "priya@northwind.example" },
          })
        ).id,
        body: "The founder likes it. Small note on the progress bar, sent by email.",
        createdAt: ago(2),
      },
    ],
  });

  await prisma.approval.createMany({
    data: [
      {
        projectId: shop.id,
        title: "Design sign-off",
        description: "Catalogue and product page.",
        status: "APPROVED",
        position: 0,
        amount: 4000,
        requestedById: pm.id,
        requestedAt: ago(30),
        decidedAt: ago(28),
        decisionNote: "Happy with these.",
      },
      {
        projectId: shop.id,
        title: "Checkout and payments",
        description: "The full purchase path on staging.",
        status: "PENDING",
        position: 1,
        amount: 6000,
        requestedById: pm.id,
        requestedAt: ago(9),
        dueDate: ago(2),
      },
      {
        projectId: shop.id,
        title: "Launch",
        status: "DRAFT",
        position: 2,
        amount: 5000,
      },
      {
        projectId: saas.id,
        title: "Concept direction",
        status: "CHANGES_REQUESTED",
        position: 0,
        requestedById: pm2.id,
        requestedAt: ago(12),
        decidedAt: ago(10),
        decisionNote: "Prefer the calmer palette; keep the layout.",
      },
    ],
  });

  await prisma.doc.createMany({
    data: [
      {
        projectId: shop.id,
        title: "Brief",
        body: "## What we agreed\n\nReplace the Shopify storefront. Keep the existing product photography.\n\n## Out of scope\n\n- Loyalty points\n- The mobile app (phase two)\n",
        createdById: pm.id,
        isClientVisible: true,
      },
      {
        projectId: shop.id,
        title: "Environments and access",
        body: "| Environment | URL |\n|---|---|\n| Staging | https://staging.acme.example |\n| Production | https://acme.example |\n\nCredentials are in the password manager, not here.\n",
        createdById: backend.id,
      },
      {
        projectId: null,
        title: "How we work",
        body: '## Tickets\n\nEvery ticket says what "done" means before anyone starts it.\n\n## Time\n\nLog it the day you do it. An hour written a week later is a guess.\n\n## Clients\n\nAnswer within one working day, even if the answer is "looking into it".\n',
        createdById: pm.id,
      },
    ],
  });

  await prisma.clientRequest.createMany({
    data: [
      {
        title: "Online shop for a bakery chain",
        description:
          "We have six locations and want click-and-collect. Budget is flexible for the right team.",
        status: "NEW",
        source: "Website form",
        contactName: "Rita Alvarez",
        contactEmail: "rita@example.com",
        companyName: "Alvarez Bakeries",
        budgetNote: "around 15k",
      },
      {
        title: "Rebuild our booking page",
        description: "The current one loses bookings on mobile.",
        status: "IN_REVIEW",
        source: "Referral",
        contactName: "Nils Berg",
        contactEmail: "nils@example.com",
        companyName: "Fjord Clinic",
        ownerId: pm2.id,
      },
    ],
  });

  console.log(
    [
      "",
      "─".repeat(72),
      "  Demo data created.",
      "",
      `  Password for every demo account:  ${password}`,
      "",
      "    maria@demo.studio   project manager",
      "    tom@demo.studio     project manager",
      "    dana@demo.studio    frontend developer",
      "    sam@demo.studio     backend developer",
      "    lea@demo.studio     designer",
      "    ivan@demo.studio    QA",
      "",
      "    john@acme.example        client portal (Acme Retail)",
      "    priya@northwind.example  client portal (Northwind SaaS)",
      "    ana@bakery.example       client portal (Corner Bakery)",
      "",
      "  Remove SEED_DEMO_DATA once you are done.",
      "─".repeat(72),
      "",
    ].join("\n"),
  );
}
