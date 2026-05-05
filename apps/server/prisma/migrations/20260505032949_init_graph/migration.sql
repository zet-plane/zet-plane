-- CreateEnum
CREATE TYPE "NodeType" AS ENUM ('scaffold', 'growth');

-- CreateEnum
CREATE TYPE "NodeStatus" AS ENUM ('active', 'blocked', 'completed', 'archived');

-- CreateEnum
CREATE TYPE "CheckpointResolution" AS ENUM ('continue', 'loop');

-- CreateEnum
CREATE TYPE "EdgeType" AS ENUM ('composition', 'dependency', 'reference');

-- CreateEnum
CREATE TYPE "CreatedBy" AS ENUM ('human', 'agent');

-- CreateTable
CREATE TABLE "Node" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "isProjectRoot" BOOLEAN NOT NULL DEFAULT false,
    "type" "NodeType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "NodeStatus" NOT NULL DEFAULT 'active',
    "isCheckpoint" BOOLEAN NOT NULL DEFAULT false,
    "checkpointResolution" "CheckpointResolution",
    "createdBy" "CreatedBy" NOT NULL,
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
    "type" "EdgeType" NOT NULL,
    "createdBy" "CreatedBy" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Edge_pkey" PRIMARY KEY ("id")
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
