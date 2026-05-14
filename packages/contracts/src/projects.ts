import { z } from "zod";
import { makeErrorResponse, ValidationErrorResponse } from "./errors";
import { ProjectId } from "./shared";

export const CreateProjectRequest = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});
export type CreateProjectRequest = z.infer<typeof CreateProjectRequest>;

export const UpdateProjectRequest = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
});
export type UpdateProjectRequest = z.infer<typeof UpdateProjectRequest>;

export const ProjectResponse = z.object({
  id: ProjectId,
  name: z.string(),
  description: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ProjectResponse = z.infer<typeof ProjectResponse>;

export const createProjectEndpoint = {
  method: "POST",
  path: "/api/projects",
  request: CreateProjectRequest,
  response: ProjectResponse,
  errors: {
    400: ValidationErrorResponse,
  },
} as const;

export const listProjectsEndpoint = {
  method: "GET",
  path: "/api/projects",
  response: z.array(ProjectResponse),
  errors: {},
} as const;

export const getProjectEndpoint = {
  method: "GET",
  path: "/api/projects/:id",
  params: z.object({ id: ProjectId }),
  response: ProjectResponse,
  errors: {
    400: ValidationErrorResponse,
    404: makeErrorResponse(z.literal("PROJECT_NOT_FOUND")),
  },
} as const;

export const updateProjectEndpoint = {
  method: "PATCH",
  path: "/api/projects/:id",
  params: z.object({ id: ProjectId }),
  request: UpdateProjectRequest,
  response: ProjectResponse,
  errors: {
    400: ValidationErrorResponse,
    404: makeErrorResponse(z.literal("PROJECT_NOT_FOUND")),
  },
} as const;

export const deleteProjectEndpoint = {
  method: "DELETE",
  path: "/api/projects/:id",
  params: z.object({ id: ProjectId }),
  errors: {
    400: ValidationErrorResponse,
    404: makeErrorResponse(z.literal("PROJECT_NOT_FOUND")),
  },
} as const;
