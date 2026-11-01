import { PrismaClient, type WorkflowStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const PASSWORD = "admin123";

function daysFromNow(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(12, 0, 0, 0);
  return date;
}

/** Wires a linear chain of transitions: each status can go forward and back. */
async function chainTransitions(
  workflowId: string,
  statuses: WorkflowStatus[],
) {
  const data: {
    workflowId: string;
    fromStatusId: string;
    toStatusId: string;
    name: string;
  }[] = [];

  for (let i = 0; i < statuses.length - 1; i++) {
    data.push({
      workflowId,
      fromStatusId: statuses[i]!.id,
      toStatusId: statuses[i + 1]!.id,
      name: `→ ${statuses[i + 1]!.name}`,
    });
    data.push({
      workflowId,
      fromStatusId: statuses[i + 1]!.id,
      toStatusId: statuses[i]!.id,
      name: `← ${statuses[i]!.name}`,
    });
  }

  await prisma.workflowTransition.createMany({ data, skipDuplicates: true });
}

async function main() {
  console.log("Clearing the database…");
  // Outreach first: leads and campaigns hang off users and cascade into
  // messages and diary entries. Left out, an end-to-end run would inherit the
  // leads the last one created and the second run would enrol a crowd.
  await prisma.timelineEntry.deleteMany();
  await prisma.outreachMessage.deleteMany();
  await prisma.campaignEnrolment.deleteMany();
  await prisma.campaignStep.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.suppression.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.leadImport.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.doc.deleteMany();
  await prisma.authToken.deleteMany();
  await prisma.loginAttempt.deleteMany();
  await prisma.approval.deleteMany();
  await prisma.runningTimer.deleteMany();
  await prisma.workLog.deleteMany();
  await prisma.ticketComment.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.chatMessage.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.clientRequest.deleteMany();
  await prisma.project.deleteMany();
  await prisma.workflowTransition.deleteMany();
  await prisma.workflowStatus.deleteMany();
  await prisma.workflow.deleteMany();
  await prisma.teamMember.deleteMany();
  await prisma.team.deleteMany();
  await prisma.user.deleteMany();
  await prisma.client.deleteMany();
  await prisma.studioSettings.deleteMany();

  // Studio-wide defaults for what a new project shows its client.
  await prisma.studioSettings.create({ data: { id: "default" } });

  const hash = await bcrypt.hash(PASSWORD, 10);

  console.log("Creating people…");
  const admin = await prisma.user.create({
    data: {
      email: "admin@studio.com",
      handle: "admin",
      name: "Ian Walker",
      passwordHash: hash,
      passwordChangedAt: new Date(),
      role: "ADMIN",
      position: "Studio founder",
      avatarColor: "#6366f1",
    },
  });

  const pm = await prisma.user.create({
    data: {
      email: "pm@studio.com",
      handle: "pm",
      name: "Maria Kingsley",
      passwordHash: hash,
      passwordChangedAt: new Date(),
      role: "MANAGER",
      position: "Project manager",
      avatarColor: "#ec4899",
    },
  });

  const dev = await prisma.user.create({
    data: {
      email: "dev@studio.com",
      handle: "dev",
      name: "Arthur Levine",
      passwordHash: hash,
      passwordChangedAt: new Date(),
      role: "MEMBER",
      position: "Frontend developer",
      gitLogin: "arthur-levine",
      avatarColor: "#0ea5e9",
    },
  });

  const backend = await prisma.user.create({
    data: {
      email: "backend@studio.com",
      handle: "backend",
      name: "Paul Gaines",
      passwordHash: hash,
      passwordChangedAt: new Date(),
      role: "MEMBER",
      position: "Backend developer",
      avatarColor: "#10b981",
    },
  });

  const designer = await prisma.user.create({
    data: {
      email: "design@studio.com",
      handle: "design",
      name: "Olivia Tate",
      passwordHash: hash,
      passwordChangedAt: new Date(),
      role: "MEMBER",
      position: "UI/UX designer",
      avatarColor: "#f59e0b",
    },
  });

  console.log("Creating clients…");
  const acme = await prisma.client.create({
    data: {
      name: "Acme Inc.",
      contactName: "John Carter",
      email: "john@acme.com",
      phone: "+1 555 123 4567",
      website: "acme.com",
      notes: "Packaging manufacturer. Second project in a row.",
    },
  });

  const techno = await prisma.client.create({
    data: {
      name: "Technoprom",
      contactName: "Sarah Doyle",
      email: "s.doyle@technoprom.com",
      phone: "+1 555 998 3311",
    },
  });

  const clientUser = await prisma.user.create({
    data: {
      email: "client@acme.com",
      handle: "client",
      name: "John Carter",
      passwordHash: hash,
      passwordChangedAt: new Date(),
      role: "CLIENT",
      position: "Marketing director",
      avatarColor: "#0891b2",
      clientId: acme.id,
    },
  });

  console.log("Creating teams…");
  const frontendTeam = await prisma.team.create({
    data: {
      name: "Frontend",
      description: "Markup and client-side work",
      color: "#0ea5e9",
      members: {
        create: [
          { userId: dev.id, title: "Tech lead" },
          { userId: admin.id, title: "Reviewer" },
        ],
      },
    },
  });

  const backendTeam = await prisma.team.create({
    data: {
      name: "Backend",
      description: "APIs, integrations, infrastructure",
      color: "#8b5cf6",
      members: { create: [{ userId: backend.id, title: "Developer" }] },
    },
  });

  const designTeam = await prisma.team.create({
    data: {
      name: "Design",
      description: "Prototypes, UI kits, mockups",
      color: "#f59e0b",
      members: { create: [{ userId: designer.id, title: "Lead designer" }] },
    },
  });

  console.log("Creating workflows…");
  const devWorkflow = await prisma.workflow.create({
    data: {
      name: "Website development",
      description: "Full cycle: from backlog to production",
      isDefault: true,
      statuses: {
        create: [
          {
            name: "Backlog",
            category: "TODO",
            color: "#94a3b8",
            position: 0,
            isInitial: true,
            canvasX: 0,
            canvasY: 0,
          },
          {
            name: "To do",
            category: "TODO",
            color: "#64748b",
            position: 1,
            canvasX: 280,
            canvasY: 0,
          },
          {
            name: "In development",
            category: "IN_PROGRESS",
            color: "#2563eb",
            position: 2,
            canvasX: 560,
            canvasY: 0,
          },
          {
            name: "Code review",
            category: "IN_PROGRESS",
            color: "#7c3aed",
            position: 3,
            canvasX: 560,
            canvasY: 150,
          },
          {
            name: "QA",
            category: "IN_PROGRESS",
            color: "#d97706",
            position: 4,
            canvasX: 280,
            canvasY: 150,
          },
          {
            name: "Done",
            category: "DONE",
            color: "#16a34a",
            position: 5,
            canvasX: 0,
            canvasY: 150,
          },
        ],
      },
    },
    include: { statuses: { orderBy: { position: "asc" } } },
  });
  await chainTransitions(devWorkflow.id, devWorkflow.statuses);

  // Anything can be sent back to the backlog — a global transition.
  await prisma.workflowTransition.create({
    data: {
      workflowId: devWorkflow.id,
      fromStatusId: null,
      toStatusId: devWorkflow.statuses[0]!.id,
      name: "Send back to backlog",
    },
  });

  // A few arrows carry rules, so the canvas shows what they look like.
  const devStatus = (i: number) => devWorkflow.statuses[i]!.id;
  const rule = (from: number, to: number, data: object) =>
    prisma.workflowTransition.updateMany({
      where: {
        workflowId: devWorkflow.id,
        fromStatusId: devStatus(from),
        toStatusId: devStatus(to),
      },
      data,
    });

  await rule(1, 2, {
    name: "Start work",
    hooks: { assignToActor: true },
  });
  await rule(2, 3, {
    name: "Send to review",
    conditions: { requireEstimate: true, requireDescription: true },
    hooks: { notifyChat: true },
  });
  await rule(4, 5, {
    name: "Release",
    conditions: { roles: ["ADMIN", "MANAGER"] },
    hooks: { setClientVisible: true, postComment: "Released to production." },
  });

  const designWorkflow = await prisma.workflow.create({
    data: {
      name: "Design process",
      description: "For design-led projects and redesigns",
      statuses: {
        create: [
          {
            name: "Brief",
            category: "TODO",
            color: "#94a3b8",
            position: 0,
            isInitial: true,
            canvasX: 0,
            canvasY: 0,
          },
          {
            name: "Concept",
            category: "IN_PROGRESS",
            color: "#db2777",
            position: 1,
            canvasX: 280,
            canvasY: 0,
          },
          {
            name: "Design",
            category: "IN_PROGRESS",
            color: "#2563eb",
            position: 2,
            canvasX: 560,
            canvasY: 0,
          },
          {
            name: "Client review",
            category: "IN_PROGRESS",
            color: "#d97706",
            position: 3,
            canvasX: 560,
            canvasY: 150,
          },
          {
            name: "Approved",
            category: "DONE",
            color: "#16a34a",
            position: 4,
            canvasX: 280,
            canvasY: 150,
          },
        ],
      },
    },
    include: { statuses: { orderBy: { position: "asc" } } },
  });
  await chainTransitions(designWorkflow.id, designWorkflow.statuses);

  console.log("Creating projects…");
  const shop = await prisma.project.create({
    data: {
      key: "ACME",
      name: "Acme online store",
      description:
        "Catalogue with 3000 SKUs, cart, Stripe checkout, ERP integration.\nTimeline: 3 months with staged acceptance.",
      status: "ACTIVE",
      clientId: acme.id,
      managerId: pm.id,
      workflowId: devWorkflow.id,
      startDate: daysFromNow(-40),
      dueDate: daysFromNow(50),
      budgetType: "HOURLY",
      budgetHours: 480,
      hourlyRate: 85,
      currency: "USD",
      portalShowDocs: true,
      // "Timeline: 3 months with staged acceptance" is the pitch, so this is
      // the project that shows the client the whole staircase and not only
      // the step under their feet. The third stage is still a draft here,
      // which is the case worth having in the demo: the client learns that an
      // account area is coming without learning what it costs.
      portalShowStagePlan: true,
      // The crew is picked person by person: the same designer is on this
      // project and on the landing page, with a different role on each.
      members: {
        create: [
          { userId: dev.id, role: "Frontend" },
          { userId: backend.id, role: "Backend, ERP integration" },
          { userId: designer.id, role: "UI" },
          { userId: admin.id, role: "Code review" },
        ],
      },
    },
  });

  const landing = await prisma.project.create({
    data: {
      key: "TPROM",
      name: "Technoprom landing page",
      description: "Single-page site for a product launch. Fixed price.",
      status: "ACTIVE",
      clientId: techno.id,
      managerId: pm.id,
      workflowId: designWorkflow.id,
      startDate: daysFromNow(-12),
      dueDate: daysFromNow(18),
      budgetType: "FIXED",
      fixedAmount: 24000,
      currency: "USD",
      // Fixed-price work: the client sees the contract value and the people,
      // but not how many hours we burn getting there.
      portalShowHours: false,
      portalShowTeam: true,
      members: {
        create: [
          { userId: designer.id, role: "Lead designer" },
          { userId: dev.id, role: "Build" },
        ],
      },
    },
  });

  await prisma.project.create({
    data: {
      key: "SITE",
      name: "Studio website redesign",
      description: "Internal project. Worked on between client engagements.",
      status: "DRAFT",
      managerId: admin.id,
      workflowId: designWorkflow.id,
      budgetType: "HOURLY",
      budgetHours: 60,
      hourlyRate: 0,
      currency: "USD",
      members: { create: [{ userId: designer.id, role: "Everything" }] },
    },
  });

  console.log("Creating tickets…");
  const s = Object.fromEntries(devWorkflow.statuses.map((x) => [x.name, x.id]));

  const shopTickets = [
    {
      title: "Build the catalogue page",
      description:
        "Product grid, filters on the left, pagination. Responsive from 360px.",
      type: "TASK" as const,
      priority: "HIGH" as const,
      statusId: s["Done"]!,
      assigneeId: dev.id,
      estimate: 24,
      isClientVisible: true,
      logs: [
        {
          userId: dev.id,
          hours: 8,
          days: -12,
          description: "Grid and product card",
        },
        { userId: dev.id, hours: 7.5, days: -11, description: "Filters" },
        {
          userId: dev.id,
          hours: 6,
          days: -10,
          description: "Responsive pass and fixes",
        },
      ],
    },
    {
      title: "Cart and checkout API",
      description: "REST endpoints: add to cart, change quantity, promo codes.",
      type: "FEATURE" as const,
      priority: "URGENT" as const,
      statusId: s["Code review"]!,
      assigneeId: backend.id,
      estimate: 32,
      isClientVisible: true,
      logs: [
        { userId: backend.id, hours: 9, days: -6, description: "Cart model" },
        { userId: backend.id, hours: 8, days: -5, description: "Promo codes" },
        { userId: backend.id, hours: 6.5, days: -3, description: "Tests" },
      ],
    },
    {
      title: "ERP integration: stock levels sync",
      description: "Sync every 15 minutes, error handling, audit log.",
      type: "FEATURE" as const,
      priority: "HIGH" as const,
      statusId: s["In development"]!,
      assigneeId: backend.id,
      estimate: 40,
      isClientVisible: true,
      logs: [
        {
          userId: backend.id,
          hours: 11,
          days: -2,
          description: "Mapped the exchange format",
        },
      ],
    },
    {
      title: "Delivery address is lost on mobile",
      description:
        "Safari iOS 17, the form drops its value after returning from the payment step.",
      acceptance: [
        "- [ ] The address survives closing the keyboard and returning from the payment step on iOS Safari 17",
        "- [ ] Covered by a regression test",
        "- [ ] No change to the checkout API contract",
      ].join("\n"),
      type: "BUG" as const,
      priority: "URGENT" as const,
      statusId: s["QA"]!,
      assigneeId: dev.id,
      estimate: 4,
      isClientVisible: false,
      logs: [
        {
          userId: dev.id,
          hours: 3.5,
          days: -1,
          description: "Fixed, verifying",
        },
      ],
    },
    {
      title: "Customer account area design",
      description: "Order history, reorder, loyalty points.",
      type: "TASK" as const,
      priority: "MEDIUM" as const,
      statusId: s["To do"]!,
      assigneeId: designer.id,
      estimate: 16,
      isClientVisible: true,
      logs: [],
    },
    {
      title: "Set up CI and staging deploys",
      description: "GitHub Actions, migrations, lint on every push.",
      type: "CHORE" as const,
      priority: "LOW" as const,
      statusId: s["Backlog"]!,
      assigneeId: null,
      estimate: 8,
      isClientVisible: false,
      logs: [],
    },
  ];

  let counter = 0;
  for (const item of shopTickets) {
    counter += 1;
    const ticket = await prisma.ticket.create({
      data: {
        projectId: shop.id,
        number: counter,
        title: item.title,
        description: item.description,
        acceptance: "acceptance" in item ? item.acceptance : null,
        type: item.type,
        priority: item.priority,
        statusId: item.statusId,
        assigneeId: item.assigneeId,
        reporterId: pm.id,
        estimate: item.estimate,
        position: counter * 1000,
        isClientVisible: item.isClientVisible,
        dueDate: daysFromNow(counter * 3),
      },
    });

    for (const log of item.logs) {
      await prisma.workLog.create({
        data: {
          ticketId: ticket.id,
          userId: log.userId,
          hours: log.hours,
          spentOn: daysFromNow(log.days),
          description: log.description,
        },
      });
    }

    await prisma.activity.create({
      data: {
        type: "ticket.created",
        message: `created ACME-${counter}: ${item.title}`,
        userId: pm.id,
        projectId: shop.id,
        ticketId: ticket.id,
      },
    });
  }

  await prisma.project.update({
    where: { id: shop.id },
    data: { ticketCounter: counter },
  });

  await prisma.ticketComment.create({
    data: {
      ticketId: (
        await prisma.ticket.findFirstOrThrow({
          where: { projectId: shop.id, number: 2 },
        })
      ).id,
      authorId: admin.id,
      body: "Looked at the PR: pull the discount maths into its own service, the controller is getting fat.",
    },
  });

  const d = Object.fromEntries(
    designWorkflow.statuses.map((x) => [x.name, x.id]),
  );
  const landingTickets = [
    {
      title: "Collect the brief and references",
      statusId: d["Approved"]!,
      assigneeId: designer.id,
      estimate: 4,
      hours: 4,
    },
    {
      title: "Hero section concept",
      statusId: d["Client review"]!,
      assigneeId: designer.id,
      estimate: 10,
      hours: 9,
    },
    {
      title: "Design the benefits and case study blocks",
      statusId: d["Design"]!,
      assigneeId: designer.id,
      estimate: 14,
      hours: 5,
    },
    {
      title: "Build the landing page",
      statusId: d["Brief"]!,
      assigneeId: dev.id,
      estimate: 20,
      hours: 0,
    },
  ];

  let landingCounter = 0;
  for (const item of landingTickets) {
    landingCounter += 1;
    const ticket = await prisma.ticket.create({
      data: {
        projectId: landing.id,
        number: landingCounter,
        title: item.title,
        type: "TASK",
        priority: "MEDIUM",
        statusId: item.statusId,
        assigneeId: item.assigneeId,
        reporterId: pm.id,
        estimate: item.estimate,
        position: landingCounter * 1000,
        isClientVisible: true,
      },
    });

    if (item.hours > 0) {
      await prisma.workLog.create({
        data: {
          ticketId: ticket.id,
          userId: item.assigneeId,
          hours: item.hours,
          spentOn: daysFromNow(-landingCounter),
        },
      });
    }
  }

  await prisma.project.update({
    where: { id: landing.id },
    data: { ticketCounter: landingCounter },
  });

  console.log("Creating approval stages…");
  await prisma.approval.createMany({
    data: [
      {
        projectId: shop.id,
        title: "Catalogue design",
        description:
          "Product grid, filters and the product card, desktop and mobile. Approving means we start building against these screens.",
        status: "APPROVED",
        position: 0,
        amount: 4200,
        requestedById: pm.id,
        requestedAt: daysFromNow(-16),
        decidedById: clientUser.id,
        decidedAt: daysFromNow(-14),
        decisionNote: "Looks good, go ahead.",
      },
      {
        projectId: shop.id,
        title: "Checkout flow",
        description:
          "Cart, delivery step, payment step and the confirmation screen, plus the copy for each.",
        status: "PENDING",
        position: 1,
        amount: 5600,
        dueDate: daysFromNow(4),
        requestedById: pm.id,
        requestedAt: daysFromNow(-2),
      },
      {
        projectId: shop.id,
        title: "Customer account area",
        description: "Order history, reorder and loyalty points.",
        status: "DRAFT",
        position: 2,
        amount: 3800,
      },
    ],
  });

  console.log("Creating docs…");
  await prisma.doc.createMany({
    data: [
      {
        title: "How we run projects",
        body: [
          "# How we run projects",
          "",
          "This is the short version. Anything not covered here, ask the project manager.",
          "",
          "## Stages",
          "",
          "1. **Brief** — we write down what the client asked for, in our own words, and get it confirmed.",
          "2. **Estimate** — hours per area of work, with a range, not a single number.",
          "3. **Build** — tickets on the project board, moved by whoever does the work.",
          "4. **Approval** — the client signs off a stage before we start the next one.",
          "",
          "## House rules",
          "",
          "- Log your hours the same day. A week-old timesheet is a guess.",
          "- If a ticket is blocked for more than a day, say so in the ticket, not in a DM.",
          "- Nothing goes to a client without the PM seeing it first.",
        ].join("\n"),
        createdById: admin.id,
        updatedById: admin.id,
      },
      {
        projectId: shop.id,
        title: "Project brief",
        isClientVisible: true,
        body: [
          "## What we are building",
          "",
          "An online store for Acme with a catalogue of roughly 3000 SKUs, a cart,",
          "Stripe checkout and a two-way integration with the existing ERP.",
          "",
          "## In scope",
          "",
          "- Catalogue with filters and search",
          "- Product page with variants and stock levels",
          "- Cart and Stripe checkout, including saved cards",
          "- Customer account area: orders, reorder, loyalty points",
          "- ERP sync: products and stock in, orders out",
          "",
          "## Out of scope for this phase",
          "",
          "- Marketplace integrations",
          "- Mobile apps",
          "- Multi-currency pricing",
          "",
          "## Timeline",
          "",
          "| Stage | Target |",
          "| --- | --- |",
          "| Catalogue design | done |",
          "| Checkout flow | in review |",
          "| Customer account area | not started |",
        ].join("\n"),
        createdById: pm.id,
        updatedById: pm.id,
      },
      {
        projectId: shop.id,
        title: "Environments and access",
        body: [
          "## Environments",
          "",
          "| Name | URL | Who can deploy |",
          "| --- | --- | --- |",
          "| Staging | staging.acme-store.com | anyone on the team |",
          "| Production | acme-store.com | PM or lead only |",
          "",
          "## Notes",
          "",
          "- Credentials live in the password manager, never in this doc and never in chat.",
          "- The ERP sandbox resets every Sunday night, so Monday test data is gone.",
          "- Stripe is in test mode on staging; use the standard test cards.",
          "",
          "> Internal doc — not shared with the client.",
        ].join("\n"),
        createdById: dev.id,
        updatedById: dev.id,
      },
    ],
  });

  console.log("Creating chat messages and requests…");
  await prisma.chatMessage.createMany({
    data: [
      {
        projectId: shop.id,
        authorId: pm.id,
        body: "Hi John! The catalogue is built and live on staging — I emailed you the link.",
        createdAt: daysFromNow(-9),
        readAt: daysFromNow(-9),
      },
      {
        projectId: shop.id,
        authorId: clientUser.id,
        body: "Looks great. One change: I'd like the product card to show the stock level.",
        createdAt: daysFromNow(-8),
        readAt: daysFromNow(-8),
      },
      {
        projectId: shop.id,
        authorId: pm.id,
        body: "Noted — we'll add it after the ERP integration, that's where the stock data comes from.",
        createdAt: daysFromNow(-8),
        readAt: daysFromNow(-8),
      },
      {
        projectId: shop.id,
        authorId: admin.id,
        body: "Budgeted +6h for caching stock levels, otherwise the ERP will fall over.",
        isInternal: true,
        createdAt: daysFromNow(-7),
      },
      {
        projectId: shop.id,
        authorId: clientUser.id,
        body: "When do we go live with payments? We'd like to make the promo on the 20th.",
        createdAt: daysFromNow(-1),
      },
    ],
  });

  await prisma.clientRequest.createMany({
    data: [
      {
        title: "Corporate website for a manufacturing plant",
        description:
          "We need a 12-page brochure site with a product catalogue and an enquiry form. Brand guidelines exist.",
        status: "NEW",
        source: "Website form",
        contactName: "David Sokolov",
        contactEmail: "sokolov@metalworks.com",
        contactPhone: "+1 555 777 8899",
        companyName: "Metalworks Ltd",
        budgetNote: "up to $60,000",
      },
      {
        title: "Delivery mobile app",
        description:
          "iOS + Android, integrating with our existing backend. We need a timeline and cost estimate.",
        status: "IN_REVIEW",
        source: "Referral",
        contactName: "Helen Fisher",
        contactEmail: "h.fisher@fastbox.com",
        companyName: "FastBox",
        budgetNote: "negotiable",
        ownerId: pm.id,
      },
      {
        title: "Support and maintenance for a legacy site",
        description: "A 2016 CMS build that needs updating plus an SEO audit.",
        status: "REJECTED",
        source: "Email",
        contactName: "Tony K.",
        contactEmail: "tony@example.com",
        budgetNote: "$5,000",
        ownerId: admin.id,
      },
    ],
  });

  await prisma.activity.createMany({
    data: [
      {
        type: "project.created",
        message: "created the project",
        userId: pm.id,
        projectId: shop.id,
        createdAt: daysFromNow(-40),
      },
      {
        type: "project.team_attached",
        message: "attached the “Frontend” team",
        userId: pm.id,
        projectId: shop.id,
        createdAt: daysFromNow(-39),
      },
      {
        type: "project.created",
        message: "created the project",
        userId: pm.id,
        projectId: landing.id,
        createdAt: daysFromNow(-12),
      },
    ],
  });

  console.log("\nDone. Sign in with password: %s", PASSWORD);
  console.log("  admin@studio.com    — administrator");
  console.log("  pm@studio.com       — project manager");
  console.log("  dev@studio.com      — developer");
  console.log("  design@studio.com   — designer");
  console.log("  client@acme.com     — client portal");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
