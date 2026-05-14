import { z } from "zod";
import { makeErrorResponse, ValidationErrorResponse } from "./errors";
import { EdgeId, NodeId, ProjectId } from "./shared";
import { CreatedBy, EdgeResponse, EdgeType } from "./nodes";

export const CreateEdgeRequest = z.object({
  fromId: NodeId,
  toId: NodeId,
  type: EdgeType,
  createdBy: CreatedBy,
});
export type CreateEdgeRequest = z.infer<typeof CreateEdgeRequest>;

export const createEdgeEndpoint = {
  method: "POST",
  path: "/api/projects/:projectId/edges",
  params: z.object({ projectId: ProjectId }),
  request: CreateEdgeRequest,
  response: EdgeResponse,
  errors: {
    400: z.union([
      ValidationErrorResponse,
      makeErrorResponse(z.literal("HTTP_ERROR")),
    ]),
    404: makeErrorResponse(z.enum(["HTTP_ERROR", "PROJECT_NOT_FOUND"])),
    409: makeErrorResponse(z.literal("HTTP_ERROR")),
  },
} as const;

export const listEdgesEndpoint = {
  method: "GET",
  path: "/api/projects/:id/edges",
  params: z.object({ id: ProjectId }),
  response: z.array(EdgeResponse),
  errors: {
    400: ValidationErrorResponse,
    404: makeErrorResponse(z.literal("PROJECT_NOT_FOUND")),
  },
} as const;

export const deleteEdgeEndpoint = {
  method: "DELETE",
  path: "/api/edges/:id",
  params: z.object({ id: EdgeId }),
  errors: {
    400: ValidationErrorResponse,
    404: makeErrorResponse(z.enum(["HTTP_ERROR", "PROJECT_NOT_FOUND"])),
  },
} as const;
