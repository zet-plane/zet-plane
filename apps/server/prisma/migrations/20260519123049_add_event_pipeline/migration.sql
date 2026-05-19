-- CreateEnum
CREATE TYPE "event_source" AS ENUM ('github', 'feishu', 'claude_hook', 'manual', 'cli');

-- CreateEnum
CREATE TYPE "incoming_event_status" AS ENUM ('pending', 'processing', 'routed', 'deduplicated', 'failed');

-- AlterEnum
ALTER TYPE "orchestrator_source_type" ADD VALUE 'incoming_event';

-- CreateTable
CREATE TABLE "incoming_events" (
    "id" TEXT NOT NULL,
    "source" "event_source" NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "project_id" TEXT,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "incoming_event_status" NOT NULL DEFAULT 'pending',
    "routed_to" TEXT,
    "error" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incoming_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_source_mappings" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "source" "event_source" NOT NULL,
    "source_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_source_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "incoming_events_idempotency_key_key" ON "incoming_events"("idempotency_key");

-- CreateIndex
CREATE INDEX "idx_incoming_events_project_id" ON "incoming_events"("project_id");

-- CreateIndex
CREATE INDEX "idx_incoming_events_status" ON "incoming_events"("status");

-- CreateIndex
CREATE INDEX "idx_project_source_mappings_project_id" ON "project_source_mappings"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "uk_project_source_mappings_source_key" ON "project_source_mappings"("source", "source_key");
