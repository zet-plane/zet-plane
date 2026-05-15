-- Backfill one staging area for projects that existed before staging nodes.
INSERT INTO "nodes" (
  "id",
  "project_id",
  "is_project_root",
  "role",
  "type",
  "title",
  "status",
  "is_checkpoint",
  "created_by",
  "created_at",
  "updated_at"
)
SELECT
  'staging-' || p."id",
  p."id",
  false,
  'staging_root',
  'staging',
  '[Staging Area]',
  'active',
  false,
  'human',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "projects" p
WHERE NOT EXISTS (
  SELECT 1 FROM "nodes" n
  WHERE n."project_id" = p."id" AND n."role" = 'staging_root'
);

INSERT INTO "edges" (
  "id",
  "project_id",
  "from_id",
  "to_id",
  "type",
  "created_by",
  "created_at"
)
SELECT
  'edge-root-staging-' || p."id",
  p."id",
  root."id",
  staging."id",
  'composition',
  'human',
  CURRENT_TIMESTAMP
FROM "projects" p
JOIN "nodes" root
  ON root."project_id" = p."id" AND root."role" = 'project_root'
JOIN "nodes" staging
  ON staging."project_id" = p."id" AND staging."role" = 'staging_root'
WHERE NOT EXISTS (
  SELECT 1 FROM "edges" e
  WHERE e."project_id" = p."id"
    AND e."from_id" = root."id"
    AND e."to_id" = staging."id"
    AND e."type" = 'composition'
);
