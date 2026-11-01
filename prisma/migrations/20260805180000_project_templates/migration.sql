-- Project templates: the shapes a studio builds over and over.
--
-- A template is made by saving a project that went well, so there is nothing
-- to migrate — the table starts empty and stays empty until somebody saves one.

CREATE TABLE "ProjectTemplate" (
  "id"          TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "isArchived"  BOOLEAN NOT NULL DEFAULT false,

  "workflowId"  TEXT,

  "budgetType"  "BudgetType" NOT NULL DEFAULT 'HOURLY',
  "budgetHours" DOUBLE PRECISION,
  "hourlyRate"  DOUBLE PRECISION,
  "fixedAmount" DOUBLE PRECISION,
  "currency"    TEXT NOT NULL DEFAULT 'USD',

  "portalShowDescription" BOOLEAN NOT NULL DEFAULT true,
  "portalShowDueDate"     BOOLEAN NOT NULL DEFAULT true,
  "portalShowTasks"       BOOLEAN NOT NULL DEFAULT true,
  "portalShowChat"        BOOLEAN NOT NULL DEFAULT true,
  "portalShowFiles"       BOOLEAN NOT NULL DEFAULT true,
  "portalAllowUploads"    BOOLEAN NOT NULL DEFAULT true,
  "portalShowHours"       BOOLEAN NOT NULL DEFAULT true,
  "portalShowMoney"       BOOLEAN NOT NULL DEFAULT true,
  "portalShowTeam"        BOOLEAN NOT NULL DEFAULT false,
  "portalShowApprovals"   BOOLEAN NOT NULL DEFAULT true,
  "portalShowDocs"        BOOLEAN NOT NULL DEFAULT false,
  "portalShowAgentHours"  BOOLEAN NOT NULL DEFAULT false,

  "createdById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProjectTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectTemplate_name_key" ON "ProjectTemplate"("name");

CREATE TABLE "ProjectTemplateItem" (
  "id"           TEXT NOT NULL,
  "templateId"   TEXT NOT NULL,
  "position"     INTEGER NOT NULL DEFAULT 0,
  "title"        TEXT NOT NULL,
  "description"  TEXT,
  "acceptance"   TEXT,
  "type"         "TicketType" NOT NULL DEFAULT 'TASK',
  "priority"     "Priority" NOT NULL DEFAULT 'MEDIUM',
  "estimate"     DOUBLE PRECISION,
  "dueAfterDays" INTEGER,
  "isClientVisible" BOOLEAN NOT NULL DEFAULT false,

  CONSTRAINT "ProjectTemplateItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProjectTemplateItem_templateId_position_idx"
  ON "ProjectTemplateItem"("templateId", "position");

ALTER TABLE "ProjectTemplate"
  ADD CONSTRAINT "ProjectTemplate_workflowId_fkey" FOREIGN KEY ("workflowId")
    REFERENCES "Workflow"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectTemplate_createdById_fkey" FOREIGN KEY ("createdById")
    REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProjectTemplateItem"
  ADD CONSTRAINT "ProjectTemplateItem_templateId_fkey" FOREIGN KEY ("templateId")
    REFERENCES "ProjectTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
