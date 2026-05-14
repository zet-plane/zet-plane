import { z } from "zod";
import { makeErrorResponse, ValidationErrorResponse } from "./errors";
import { EdgeId, NodeId, ProjectId } from "./shared";

export const NodeStatus = z.enum([
  "active",
  "blocked",
  "completed",
  "archived",
]);

export const NodeRole = z.enum([
  "project_root",
  "staging_root",
  "regular",
]);

export const NodeType = z.enum([
  "scaffold",
  "growth",
  "staging",
]);

export const CreatedBy = z.enum([
  "human",
  "agent",
]);

export const CheckpointResolution = z.enum([
  "continue",
  "loop",
]);

export const EdgeType = z.enum([
  "composition",
  "dependency",
]);

export const CreateNodeRequest = z.object({
  title: z.string().min(1).max(200),
  parentId: NodeId.optional(),
  description: z.string().optional(),
});
export type CreateNodeRequest = z.infer<typeof CreateNodeRequest>;

export const UpdateNodeRequest = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  isCheckpoint: z.boolean().optional(),
  status: NodeStatus.optional(),
});
export type UpdateNodeRequest = z.infer<typeof UpdateNodeRequest>;

export const ResolveCheckpointRequest = z.object({
  resolution: CheckpointResolution,
});
export type ResolveCheckpointRequest = z.infer<typeof ResolveCheckpointRequest>;

export const DeleteNodeStrategy = z.enum([
  "block",
  "cascade",
  "reparent-to-parent",
  "reparent-to-root",
]);

export const DeleteNodeRequest = z.object({
  strategy: DeleteNodeStrategy.optional(),
});
export type DeleteNodeRequest = z.infer<typeof DeleteNodeRequest>;

export const ReplaceNodeEdgesRequest = z.object({
  type: EdgeType,
  newFromId: NodeId,
  projectId: ProjectId,
  createdBy: CreatedBy,
});
export type ReplaceNodeEdgesRequest = z.infer<typeof ReplaceNodeEdgesRequest>;

export const NodeResponse = z.object({
  id: NodeId,
  projectId: ProjectId,
  isProjectRoot: z.boolean(),
  role: NodeRole,
  type: NodeType,
  title: z.string(),
  description: z.string().nullable(),
  status: NodeStatus,
  isCheckpoint: z.boolean(),
  checkpointResolution: CheckpointResolution.nullable(),
  createdBy: CreatedBy,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type NodeResponse = z.infer<typeof NodeResponse>;

export const EdgeResponse = z.object({
  id: EdgeId,
  projectId: ProjectId,
  fromId: NodeId,
  toId: NodeId,
  type: EdgeType,
  createdBy: CreatedBy,
  createdAt: z.iso.datetime(),
});
export type EdgeResponse = z.infer<typeof EdgeResponse>;

export const SubgraphResponse = z.object({
  nodes: z.array(NodeResponse),
  edges: z.array(EdgeResponse),
});
export type SubgraphResponse = z.infer<typeof SubgraphResponse>;

export const DeleteNodeResponse = z.object({
  affectedNodeIds: z.array(NodeId),
});
export type DeleteNodeResponse = z.infer<typeof DeleteNodeResponse>;

export const createNodeEndpoint = {
  method: "POST",
  path: "/api/projects/:id/nodes",
  params: z.object({ id: ProjectId }),
  request: CreateNodeRequest,
  response: NodeResponse,
  errors: {
    400: ValidationErrorResponse,
    404: makeErrorResponse(
      z.enum(["PROJECT_NOT_FOUND", "PARENT_NODE_NOT_FOUND"]),
    ),
    409: makeErrorResponse(
      z.enum([
        "STAGING_NODE_PROTECTED",
        "PARENT_NODE_ARCHIVED",
        "PARENT_NODE_COMPLETED",
      ]),
    ),
  },
} as const;

export const listNodesEndpoint = {
  method: "GET",
  path: "/api/projects/:id/nodes",
  params: z.object({ id: ProjectId }),
  response: z.array(NodeResponse),
  errors: {
    404: makeErrorResponse(z.literal("HTTP_ERROR")),
  },
} as const;

export const getNodeSubgraphEndpoint = {
  method: "GET",
  path: "/api/nodes/:id/subgraph",
  params: z.object({ id: NodeId }),
  response: SubgraphResponse,
  errors: {
    404: makeErrorResponse(z.literal("HTTP_ERROR")),
  },
} as const;

export const updateNodeEndpoint = {
  method: "PATCH",
  path: "/api/nodes/:id",
  params: z.object({ id: NodeId }),
  request: UpdateNodeRequest,
  response: NodeResponse,
  errors: {
    400: z.union([
      ValidationErrorResponse,
      makeErrorResponse(z.literal("HTTP_ERROR")),
    ]),
    404: makeErrorResponse(z.literal("HTTP_ERROR")),
    409: makeErrorResponse(z.literal("HTTP_ERROR")),
  },
} as const;

export const resolveCheckpointEndpoint = {
  method: "PATCH",
  path: "/api/nodes/:id/resolution",
  params: z.object({ id: NodeId }),
  request: ResolveCheckpointRequest,
  response: NodeResponse,
  errors: {
    400: ValidationErrorResponse,
    404: makeErrorResponse(z.literal("HTTP_ERROR")),
    409: makeErrorResponse(z.literal("HTTP_ERROR")),
  },
} as const;

export const deleteNodeEndpoint = {
  method: "DELETE",
  path: "/api/nodes/:id",
  params: z.object({ id: NodeId }),
  request: DeleteNodeRequest,
  response: DeleteNodeResponse,
  errors: {
    400: ValidationErrorResponse,
    404: makeErrorResponse(z.literal("HTTP_ERROR")),
    409: makeErrorResponse(z.literal("HTTP_ERROR")),
  },
} as const;

export const replaceNodeEdgesEndpoint = {
  method: "PATCH",
  path: "/api/nodes/:id/edges",
  params: z.object({ id: NodeId }),
  request: ReplaceNodeEdgesRequest,
  response: EdgeResponse,
  errors: {
    400: ValidationErrorResponse,
    404: makeErrorResponse(z.literal("HTTP_ERROR")),
    409: makeErrorResponse(z.literal("HTTP_ERROR")),
  },
} as const;
