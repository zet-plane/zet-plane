-- CreateEnum
CREATE TYPE "OrchestratorTaskType" AS ENUM ('event_anchor', 'graph_growth', 'checkpoint', 'embedding');

-- CreateEnum
CREATE TYPE "OrchestratorTaskStatus" AS ENUM ('pending', 'running', 'succeeded', 'failed', 'skipped', 'waiting_for_approval');

-- CreateEnum
CREATE TYPE "OrchestratorSourceType" AS ENUM ('graph_event', 'knowledge_event', 'schedule', 'manual');

-- CreateTable
CREATE TABLE "OrchestratorTask" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "OrchestratorTaskType" NOT NULL,
    "sourceType" "OrchestratorSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "status" "OrchestratorTaskStatus" NOT NULL DEFAULT 'pending',
    "idempotencyKey" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "modelResult" JSONB,
    "error" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrchestratorTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrchestratorTask_idempotencyKey_key" ON "OrchestratorTask"("idempotencyKey");

-- CreateIndex
CREATE INDEX "OrchestratorTask_projectId_idx" ON "OrchestratorTask"("projectId");

-- CreateIndex
CREATE INDEX "OrchestratorTask_status_idx" ON "OrchestratorTask"("status");
