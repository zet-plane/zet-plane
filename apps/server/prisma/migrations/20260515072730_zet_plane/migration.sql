/*
  Warnings:

  - You are about to drop the `edges` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `knowledge_entries` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `knowledge_revisions` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `nodes` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "NodeType" AS ENUM ('scaffold', 'growth');

-- DropTable
DROP TABLE "edges";

-- DropTable
DROP TABLE "knowledge_entries";

-- DropTable
DROP TABLE "knowledge_revisions";

-- DropTable
DROP TABLE "nodes";

-- DropEnum
DROP TYPE "node_role";

-- DropEnum
DROP TYPE "node_type";

-- CreateTable
CREATE TABLE "Node" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "isProjectRoot" BOOLEAN NOT NULL DEFAULT false,
    "is_staging_root" BOOLEAN NOT NULL DEFAULT false,
    "type" "NodeType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "node_status" NOT NULL DEFAULT 'active',
    "isCheckpoint" BOOLEAN NOT NULL DEFAULT false,
    "checkpointResolution" "checkpoint_resolution",
    "createdBy" "created_by" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Node_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Edge" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "type" "edge_type" NOT NULL,
    "createdBy" "created_by" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Edge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeEntry" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "category" "entry_category" NOT NULL,
    "title" TEXT NOT NULL,
    "body" JSONB NOT NULL,
    "status" "entry_status" NOT NULL DEFAULT 'draft',
    "embeddingStatus" "embedding_status" NOT NULL DEFAULT 'unindexed',
    "embedding" vector(1536),
    "createdBy" "created_by" NOT NULL,
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
    "change_note" TEXT,
    "created_by" "created_by" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Node_projectId_idx" ON "Node"("projectId");

-- CreateIndex
CREATE INDEX "Edge_projectId_idx" ON "Edge"("projectId");

-- CreateIndex
CREATE INDEX "Edge_fromId_idx" ON "Edge"("fromId");

-- CreateIndex
CREATE INDEX "Edge_toId_idx" ON "Edge"("toId");

-- CreateIndex
CREATE UNIQUE INDEX "Edge_fromId_toId_type_key" ON "Edge"("fromId", "toId", "type");

-- CreateIndex
CREATE INDEX "KnowledgeEntry_projectId_idx" ON "KnowledgeEntry"("projectId");

-- CreateIndex
CREATE INDEX "KnowledgeEntry_nodeId_idx" ON "KnowledgeEntry"("nodeId");

-- CreateIndex
CREATE INDEX "KnowledgeRevision_entryId_idx" ON "KnowledgeRevision"("entryId");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeRevision_entryId_version_key" ON "KnowledgeRevision"("entryId", "version");
