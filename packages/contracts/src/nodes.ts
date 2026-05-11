import { z } from "zod";
import { makeErrorResponse, ValidationErrorResponse } from "./errors";
import { NodeId, ProjectId } from "./shared";

export const NodeStatus = z.enum([
  "active",
  "blocked",
  "completed",
  "archived",
]);

export const CreateNodeRequest = z.object({
  title: z.string().min(1).max(200),
  parentId: NodeId.optional(),
  description: z.string().optional(),
});
export type CreateNodeRequest = z.infer<typeof CreateNodeRequest>;

export const NodeResponse = z.object({
  id: NodeId,
  projectId: ProjectId,
  title: z.string(),
  status: NodeStatus,
  description: z.string().nullable(),
  isProjectRoot: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type NodeResponse = z.infer<typeof NodeResponse>;

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
      z.enum(["PARENT_NODE_ARCHIVED", "PARENT_NODE_COMPLETED"]),
    ),
  },
} as const;
