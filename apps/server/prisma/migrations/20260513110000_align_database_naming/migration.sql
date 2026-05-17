DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NodeType') AND NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'node_type') THEN
    ALTER TYPE "NodeType" RENAME TO "node_type";
  END IF;

  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NodeStatus') AND NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'node_status') THEN
    ALTER TYPE "NodeStatus" RENAME TO "node_status";
  END IF;

  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CheckpointResolution') AND NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'checkpoint_resolution') THEN
    ALTER TYPE "CheckpointResolution" RENAME TO "checkpoint_resolution";
  END IF;

  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EdgeType') AND NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'edge_type') THEN
    ALTER TYPE "EdgeType" RENAME TO "edge_type";
  END IF;

  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CreatedBy') AND NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'created_by') THEN
    ALTER TYPE "CreatedBy" RENAME TO "created_by";
  END IF;

  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EntryCategory') AND NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'entry_category') THEN
    ALTER TYPE "EntryCategory" RENAME TO "entry_category";
  END IF;

  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EntryStatus') AND NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'entry_status') THEN
    ALTER TYPE "EntryStatus" RENAME TO "entry_status";
  END IF;

  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EmbeddingStatus') AND NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'embedding_status') THEN
    ALTER TYPE "EmbeddingStatus" RENAME TO "embedding_status";
  END IF;

  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OrchestratorTaskType') AND NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'orchestrator_task_type') THEN
    ALTER TYPE "OrchestratorTaskType" RENAME TO "orchestrator_task_type";
  END IF;

  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OrchestratorTaskStatus') AND NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'orchestrator_task_status') THEN
    ALTER TYPE "OrchestratorTaskStatus" RENAME TO "orchestrator_task_status";
  END IF;

  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OrchestratorSourceType') AND NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'orchestrator_source_type') THEN
    ALTER TYPE "OrchestratorSourceType" RENAME TO "orchestrator_source_type";
  END IF;
END $$;

ALTER TABLE IF EXISTS "Node" RENAME TO "nodes";
ALTER TABLE IF EXISTS "Edge" RENAME TO "edges";
ALTER TABLE IF EXISTS "KnowledgeEntry" RENAME TO "knowledge_entries";
ALTER TABLE IF EXISTS "KnowledgeRevision" RENAME TO "knowledge_revisions";
ALTER TABLE IF EXISTS "OrchestratorTask" RENAME TO "orchestrator_tasks";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'nodes' AND column_name = 'projectId'
  ) THEN
    ALTER TABLE "nodes" RENAME COLUMN "projectId" TO "project_id";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'nodes' AND column_name = 'isProjectRoot'
  ) THEN
    ALTER TABLE "nodes" RENAME COLUMN "isProjectRoot" TO "is_project_root";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'nodes' AND column_name = 'type'
  ) THEN
    ALTER TABLE "nodes" RENAME COLUMN "type" TO "node_type";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'nodes' AND column_name = 'status'
  ) THEN
    ALTER TABLE "nodes" RENAME COLUMN "status" TO "node_status";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'nodes' AND column_name = 'isCheckpoint'
  ) THEN
    ALTER TABLE "nodes" RENAME COLUMN "isCheckpoint" TO "is_checkpoint";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'nodes' AND column_name = 'checkpointResolution'
  ) THEN
    ALTER TABLE "nodes" RENAME COLUMN "checkpointResolution" TO "checkpoint_resolution";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'nodes' AND column_name = 'createdBy'
  ) THEN
    ALTER TABLE "nodes" RENAME COLUMN "createdBy" TO "created_by";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'nodes' AND column_name = 'createdAt'
  ) THEN
    ALTER TABLE "nodes" RENAME COLUMN "createdAt" TO "created_at";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'nodes' AND column_name = 'updatedAt'
  ) THEN
    ALTER TABLE "nodes" RENAME COLUMN "updatedAt" TO "updated_at";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'edges' AND column_name = 'projectId'
  ) THEN
    ALTER TABLE "edges" RENAME COLUMN "projectId" TO "project_id";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'edges' AND column_name = 'fromId'
  ) THEN
    ALTER TABLE "edges" RENAME COLUMN "fromId" TO "from_node_id";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'edges' AND column_name = 'toId'
  ) THEN
    ALTER TABLE "edges" RENAME COLUMN "toId" TO "to_node_id";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'edges' AND column_name = 'type'
  ) THEN
    ALTER TABLE "edges" RENAME COLUMN "type" TO "edge_type";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'edges' AND column_name = 'createdBy'
  ) THEN
    ALTER TABLE "edges" RENAME COLUMN "createdBy" TO "created_by";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'edges' AND column_name = 'createdAt'
  ) THEN
    ALTER TABLE "edges" RENAME COLUMN "createdAt" TO "created_at";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'knowledge_entries' AND column_name = 'projectId'
  ) THEN
    ALTER TABLE "knowledge_entries" RENAME COLUMN "projectId" TO "project_id";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'knowledge_entries' AND column_name = 'nodeId'
  ) THEN
    ALTER TABLE "knowledge_entries" RENAME COLUMN "nodeId" TO "node_id";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'knowledge_entries' AND column_name = 'status'
  ) THEN
    ALTER TABLE "knowledge_entries" RENAME COLUMN "status" TO "entry_status";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'knowledge_entries' AND column_name = 'embeddingStatus'
  ) THEN
    ALTER TABLE "knowledge_entries" RENAME COLUMN "embeddingStatus" TO "embedding_status";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'knowledge_entries' AND column_name = 'createdBy'
  ) THEN
    ALTER TABLE "knowledge_entries" RENAME COLUMN "createdBy" TO "created_by";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'knowledge_entries' AND column_name = 'createdAt'
  ) THEN
    ALTER TABLE "knowledge_entries" RENAME COLUMN "createdAt" TO "created_at";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'knowledge_entries' AND column_name = 'updatedAt'
  ) THEN
    ALTER TABLE "knowledge_entries" RENAME COLUMN "updatedAt" TO "updated_at";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'knowledge_revisions' AND column_name = 'entryId'
  ) THEN
    ALTER TABLE "knowledge_revisions" RENAME COLUMN "entryId" TO "knowledge_entry_id";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'knowledge_revisions' AND column_name = 'changeNote'
  ) THEN
    ALTER TABLE "knowledge_revisions" RENAME COLUMN "changeNote" TO "change_note";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'knowledge_revisions' AND column_name = 'createdBy'
  ) THEN
    ALTER TABLE "knowledge_revisions" RENAME COLUMN "createdBy" TO "created_by";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'knowledge_revisions' AND column_name = 'createdAt'
  ) THEN
    ALTER TABLE "knowledge_revisions" RENAME COLUMN "createdAt" TO "created_at";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orchestrator_tasks' AND column_name = 'projectId'
  ) THEN
    ALTER TABLE "orchestrator_tasks" RENAME COLUMN "projectId" TO "project_id";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orchestrator_tasks' AND column_name = 'type'
  ) THEN
    ALTER TABLE "orchestrator_tasks" RENAME COLUMN "type" TO "task_type";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orchestrator_tasks' AND column_name = 'sourceType'
  ) THEN
    ALTER TABLE "orchestrator_tasks" RENAME COLUMN "sourceType" TO "source_type";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orchestrator_tasks' AND column_name = 'sourceId'
  ) THEN
    ALTER TABLE "orchestrator_tasks" RENAME COLUMN "sourceId" TO "source_id";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orchestrator_tasks' AND column_name = 'status'
  ) THEN
    ALTER TABLE "orchestrator_tasks" RENAME COLUMN "status" TO "task_status";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orchestrator_tasks' AND column_name = 'idempotencyKey'
  ) THEN
    ALTER TABLE "orchestrator_tasks" RENAME COLUMN "idempotencyKey" TO "idempotency_key";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orchestrator_tasks' AND column_name = 'modelResult'
  ) THEN
    ALTER TABLE "orchestrator_tasks" RENAME COLUMN "modelResult" TO "model_result";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orchestrator_tasks' AND column_name = 'createdAt'
  ) THEN
    ALTER TABLE "orchestrator_tasks" RENAME COLUMN "createdAt" TO "created_at";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orchestrator_tasks' AND column_name = 'updatedAt'
  ) THEN
    ALTER TABLE "orchestrator_tasks" RENAME COLUMN "updatedAt" TO "updated_at";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Node_pkey') THEN
    ALTER TABLE "nodes" RENAME CONSTRAINT "Node_pkey" TO "nodes_pkey";
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Edge_pkey') THEN
    ALTER TABLE "edges" RENAME CONSTRAINT "Edge_pkey" TO "edges_pkey";
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'KnowledgeEntry_pkey') THEN
    ALTER TABLE "knowledge_entries" RENAME CONSTRAINT "KnowledgeEntry_pkey" TO "knowledge_entries_pkey";
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'KnowledgeRevision_pkey') THEN
    ALTER TABLE "knowledge_revisions" RENAME CONSTRAINT "KnowledgeRevision_pkey" TO "knowledge_revisions_pkey";
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrchestratorTask_pkey') THEN
    ALTER TABLE "orchestrator_tasks" RENAME CONSTRAINT "OrchestratorTask_pkey" TO "orchestrator_tasks_pkey";
  END IF;
END $$;

ALTER INDEX IF EXISTS "Node_projectId_idx" RENAME TO "idx_nodes_project_id";
ALTER INDEX IF EXISTS "Edge_projectId_idx" RENAME TO "idx_edges_project_id";
ALTER INDEX IF EXISTS "Edge_fromId_idx" RENAME TO "idx_edges_from_node_id";
ALTER INDEX IF EXISTS "Edge_toId_idx" RENAME TO "idx_edges_to_node_id";
ALTER INDEX IF EXISTS "Edge_fromId_toId_type_key" RENAME TO "uk_edges_from_node_id_to_node_id_edge_type";
ALTER INDEX IF EXISTS "KnowledgeEntry_projectId_idx" RENAME TO "idx_knowledge_entries_project_id";
ALTER INDEX IF EXISTS "KnowledgeEntry_nodeId_idx" RENAME TO "idx_knowledge_entries_node_id";
ALTER INDEX IF EXISTS "KnowledgeRevision_entryId_idx" RENAME TO "idx_knowledge_revisions_knowledge_entry_id";
ALTER INDEX IF EXISTS "KnowledgeRevision_entryId_version_key" RENAME TO "uk_knowledge_revisions_knowledge_entry_id_version";
ALTER INDEX IF EXISTS "OrchestratorTask_idempotencyKey_key" RENAME TO "uk_orchestrator_tasks_idempotency_key";
ALTER INDEX IF EXISTS "OrchestratorTask_projectId_idx" RENAME TO "idx_orchestrator_tasks_project_id";
ALTER INDEX IF EXISTS "OrchestratorTask_status_idx" RENAME TO "idx_orchestrator_tasks_task_status";
