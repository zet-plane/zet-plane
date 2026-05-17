-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "EntryCategory" AS ENUM ('decision', 'pitfall', 'finding', 'context');

-- CreateEnum
CREATE TYPE "EntryStatus" AS ENUM ('draft', 'published', 'deprecated');

-- CreateEnum
CREATE TYPE "EmbeddingStatus" AS ENUM ('unindexed', 'indexed');

-- CreateTable
CREATE TABLE "KnowledgeEntry" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "category" "EntryCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "body" JSONB NOT NULL,
    "status" "EntryStatus" NOT NULL DEFAULT 'draft',
    "embeddingStatus" "EmbeddingStatus" NOT NULL DEFAULT 'unindexed',
    "embedding" vector(1536),
    "createdBy" "CreatedBy" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeRevision" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "body" JSONB NOT NULL,
    "changeNote" TEXT,
    "createdBy" "CreatedBy" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KnowledgeEntry_projectId_idx" ON "KnowledgeEntry"("projectId");

-- CreateIndex
CREATE INDEX "KnowledgeEntry_nodeId_idx" ON "KnowledgeEntry"("nodeId");

-- CreateIndex
CREATE INDEX "KnowledgeRevision_entryId_idx" ON "KnowledgeRevision"("entryId");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeRevision_entryId_version_key" ON "KnowledgeRevision"("entryId", "version");
