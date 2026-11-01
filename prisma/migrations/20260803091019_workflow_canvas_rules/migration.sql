-- AlterTable
ALTER TABLE "WorkflowStatus" ADD COLUMN     "canvasX" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "canvasY" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "WorkflowTransition" ADD COLUMN     "conditions" JSONB,
ADD COLUMN     "hooks" JSONB;
