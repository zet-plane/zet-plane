/*
  Warnings:

  - You are about to drop the `Edge` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `KnowledgeEntry` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `KnowledgeRevision` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Node` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "node_type" AS ENUM ('scaffold', 'growth');

-- DropTable
DROP TABLE "Edge";

-- DropTable
DROP TABLE "KnowledgeEntry";

-- DropTable
DROP TABLE "KnowledgeRevision";

-- DropTable
DROP TABLE "Node";

-- DropEnum
DROP TYPE "NodeType";

-- CreateTable
CREATE TABLE "nodes" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "is_project_root" BOOLEAN NOT NULL DEFAULT false,
    "is_staging_root" BOOLEAN NOT NULL DEFAULT false,
    "node_type" "node_type" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "node_status" "node_status" NOT NULL DEFAULT 'active',
    "is_checkpoint" BOOLEAN NOT NULL DEFAULT false,
    "checkpoint_resolution" "checkpoint_resolution",
    "created_by" "created_by" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edges" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "from_id" TEXT NOT NULL,
    "to_id" TEXT NOT NULL,
    "edge_type" "edge_type" NOT NULL,
    "created_by" "created_by" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "edges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_entries" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "node_id" TEXT NOT NULL,
    "entry_category" "entry_category" NOT NULL,
    "title" TEXT NOT NULL,
    "body" JSONB NOT NULL,
    "entry_status" "entry_status" NOT NULL DEFAULT 'draft',
    "embedding_status" "embedding_status" NOT NULL DEFAULT 'unindexed',
    "embedding" vector(1536),
    "created_by" "created_by" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_revisions" (
    "id" TEXT NOT NULL,
    "entry_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "body" JSONB NOT NULL,
    "change_note" TEXT,
    "created_by" "created_by" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_nodes_project_id" ON "nodes"("project_id");

-- CreateIndex
CREATE INDEX "idx_edges_project_id" ON "edges"("project_id");

-- CreateIndex
CREATE INDEX "idx_edges_from_id" ON "edges"("from_id");

-- CreateIndex
CREATE INDEX "idx_edges_to_id" ON "edges"("to_id");

-- CreateIndex
CREATE UNIQUE INDEX "uk_edges_from_to_type" ON "edges"("from_id", "to_id", "edge_type");

-- CreateIndex
CREATE INDEX "idx_knowledge_entries_project_id" ON "knowledge_entries"("project_id");

-- CreateIndex
CREATE INDEX "idx_knowledge_entries_node_id" ON "knowledge_entries"("node_id");

-- CreateIndex
CREATE INDEX "idx_knowledge_revisions_entry_id" ON "knowledge_revisions"("entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "uk_knowledge_revisions_entry_version" ON "knowledge_revisions"("entry_id", "version");
