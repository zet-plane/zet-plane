-- CreateEnum
CREATE TYPE "node_role" AS ENUM ('regular', 'project_root', 'staging_root');

-- AlterEnum
ALTER TYPE "node_type" ADD VALUE 'staging';

-- AlterTable
ALTER TABLE "nodes" ADD COLUMN "role" "node_role" NOT NULL DEFAULT 'regular';

-- Backfill project roots created before NodeRole existed.
UPDATE "nodes" SET "role" = 'project_root' WHERE "is_project_root" = true;

-- CreateIndex
CREATE INDEX "nodes_project_id_role_idx" ON "nodes"("project_id", "role");

-- Enforce one system root of each kind per project.
CREATE UNIQUE INDEX "nodes_project_root_unique_idx"
ON "nodes"("project_id")
WHERE "role" = 'project_root';

CREATE UNIQUE INDEX "nodes_staging_root_unique_idx"
ON "nodes"("project_id")
WHERE "role" = 'staging_root';
