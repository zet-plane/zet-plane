-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "node_type" AS ENUM ('scaffold', 'growth');

-- CreateEnum
CREATE TYPE "node_status" AS ENUM ('active', 'blocked', 'completed', 'archived');

-- CreateEnum
CREATE TYPE "checkpoint_resolution" AS ENUM ('continue', 'loop');

-- CreateEnum
CREATE TYPE "edge_type" AS ENUM ('composition', 'dependency');

-- CreateEnum
CREATE TYPE "created_by" AS ENUM ('human', 'agent');

-- CreateEnum
CREATE TYPE "entry_category" AS ENUM ('decision', 'pitfall', 'finding', 'context');

-- CreateEnum
CREATE TYPE "entry_status" AS ENUM ('draft', 'published', 'deprecated');

-- CreateEnum
CREATE TYPE "embedding_status" AS ENUM ('unindexed', 'indexed');

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nodes" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "is_project_root" BOOLEAN NOT NULL DEFAULT false,
    "type" "node_type" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "node_status" NOT NULL DEFAULT 'active',
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
    "type" "edge_type" NOT NULL,
    "created_by" "created_by" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "edges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_entries" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "node_id" TEXT NOT NULL,
    "category" "entry_category" NOT NULL,
    "title" TEXT NOT NULL,
    "body" JSONB NOT NULL,
    "status" "entry_status" NOT NULL DEFAULT 'draft',
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
CREATE INDEX "nodes_project_id_idx" ON "nodes"("project_id");

-- CreateIndex
CREATE INDEX "edges_project_id_idx" ON "edges"("project_id");

-- CreateIndex
CREATE INDEX "edges_from_id_idx" ON "edges"("from_id");

-- CreateIndex
CREATE INDEX "edges_to_id_idx" ON "edges"("to_id");

-- CreateIndex
CREATE UNIQUE INDEX "edges_from_id_to_id_type_key" ON "edges"("from_id", "to_id", "type");

-- CreateIndex
CREATE INDEX "knowledge_entries_project_id_idx" ON "knowledge_entries"("project_id");

-- CreateIndex
CREATE INDEX "knowledge_entries_node_id_idx" ON "knowledge_entries"("node_id");

-- CreateIndex
CREATE INDEX "knowledge_revisions_entry_id_idx" ON "knowledge_revisions"("entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_revisions_entry_id_version_key" ON "knowledge_revisions"("entry_id", "version");
