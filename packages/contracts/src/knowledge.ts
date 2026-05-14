import { z } from "zod";
import { makeErrorResponse, ValidationErrorResponse } from "./errors";
import { EntryId, NodeId, ProjectId, RevisionId } from "./shared";
import { CreatedBy } from "./nodes";

export const EntryCategory = z.enum([
  "decision",
  "pitfall",
  "finding",
  "context",
]);

export const EntryStatus = z.enum([
  "draft",
  "published",
  "deprecated",
]);

export const EmbeddingStatus = z.enum([
  "unindexed",
  "indexed",
]);

export const CreateEntryRequest = z.object({
  nodeId: NodeId.optional(),
  category: EntryCategory,
  title: z.string().min(1),
  body: z.unknown(),
  changeNote: z.string().optional(),
  createdBy: CreatedBy,
});
export type CreateEntryRequest = z.infer<typeof CreateEntryRequest>;

export const ListEntriesQuery = z.object({
  category: EntryCategory.optional(),
  nodeId: NodeId.optional(),
  status: EntryStatus.optional(),
});
export type ListEntriesQuery = z.infer<typeof ListEntriesQuery>;

export const UpdateEntryRequest = z.object({
  title: z.string().min(1).optional(),
  category: EntryCategory.optional(),
  status: EntryStatus.optional(),
  nodeId: NodeId.optional(),
});
export type UpdateEntryRequest = z.infer<typeof UpdateEntryRequest>;

export const UpdateBodyRequest = z.object({
  body: z.unknown(),
  changeNote: z.string().optional(),
  createdBy: CreatedBy,
});
export type UpdateBodyRequest = z.infer<typeof UpdateBodyRequest>;

export const StoreEmbeddingRequest = z.object({
  vector: z.array(z.number()),
});
export type StoreEmbeddingRequest = z.infer<typeof StoreEmbeddingRequest>;

export const SearchFilters = z.object({
  category: z.array(EntryCategory).optional(),
  status: z.array(EntryStatus).optional(),
  nodeId: z.array(NodeId).optional(),
});
export type SearchFilters = z.infer<typeof SearchFilters>;

export const SearchRequest = z.object({
  vector: z.array(z.number()),
  filters: SearchFilters.optional(),
  limit: z.number().int().positive().optional(),
  threshold: z.number().min(0).max(1).optional(),
});
export type SearchRequest = z.infer<typeof SearchRequest>;

export const KnowledgeEntryResponse = z.object({
  id: EntryId,
  projectId: ProjectId,
  nodeId: NodeId,
  category: EntryCategory,
  title: z.string(),
  body: z.unknown(),
  status: EntryStatus,
  embeddingStatus: EmbeddingStatus,
  createdBy: CreatedBy,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type KnowledgeEntryResponse = z.infer<typeof KnowledgeEntryResponse>;

export const KnowledgeRevisionResponse = z.object({
  id: RevisionId,
  entryId: EntryId,
  version: z.number().int().positive(),
  body: z.unknown(),
  changeNote: z.string().nullable(),
  createdBy: CreatedBy,
  createdAt: z.iso.datetime(),
});
export type KnowledgeRevisionResponse = z.infer<typeof KnowledgeRevisionResponse>;

export const SearchResultResponse = KnowledgeEntryResponse.extend({
  score: z.number(),
});
export type SearchResultResponse = z.infer<typeof SearchResultResponse>;

const ProjectParams = z.object({ id: ProjectId });
const EntryParams = z.object({ id: EntryId });
const RevisionParams = z.object({
  id: EntryId,
  version: z.coerce.number().int().positive(),
});

export const createEntryEndpoint = {
  method: "POST",
  path: "/api/projects/:id/entries",
  params: ProjectParams,
  request: CreateEntryRequest,
  response: KnowledgeEntryResponse,
  errors: {
    400: ValidationErrorResponse,
    404: makeErrorResponse(z.enum(["HTTP_ERROR", "PROJECT_NOT_FOUND"])),
    409: makeErrorResponse(z.literal("HTTP_ERROR")),
  },
} as const;

export const listEntriesEndpoint = {
  method: "GET",
  path: "/api/projects/:id/entries",
  params: ProjectParams,
  query: ListEntriesQuery,
  response: z.array(KnowledgeEntryResponse),
  errors: {
    400: ValidationErrorResponse,
  },
} as const;

export const getEntryEndpoint = {
  method: "GET",
  path: "/api/entries/:id",
  params: EntryParams,
  response: KnowledgeEntryResponse,
  errors: {
    400: ValidationErrorResponse,
    404: makeErrorResponse(z.literal("HTTP_ERROR")),
  },
} as const;

export const updateEntryEndpoint = {
  method: "PATCH",
  path: "/api/entries/:id",
  params: EntryParams,
  request: UpdateEntryRequest,
  response: KnowledgeEntryResponse,
  errors: {
    400: z.union([
      ValidationErrorResponse,
      makeErrorResponse(z.literal("HTTP_ERROR")),
    ]),
    404: makeErrorResponse(z.enum(["HTTP_ERROR", "PROJECT_NOT_FOUND"])),
    409: makeErrorResponse(z.literal("HTTP_ERROR")),
  },
} as const;

export const deleteEntryEndpoint = {
  method: "DELETE",
  path: "/api/entries/:id",
  params: EntryParams,
  response: KnowledgeEntryResponse,
  errors: {
    400: ValidationErrorResponse,
    404: makeErrorResponse(z.enum(["HTTP_ERROR", "PROJECT_NOT_FOUND"])),
  },
} as const;

export const updateEntryBodyEndpoint = {
  method: "PATCH",
  path: "/api/entries/:id/body",
  params: EntryParams,
  request: UpdateBodyRequest,
  response: KnowledgeRevisionResponse,
  errors: {
    400: ValidationErrorResponse,
    404: makeErrorResponse(z.literal("HTTP_ERROR")),
    409: makeErrorResponse(z.literal("HTTP_ERROR")),
  },
} as const;

export const listEntryRevisionsEndpoint = {
  method: "GET",
  path: "/api/entries/:id/revisions",
  params: EntryParams,
  response: z.array(KnowledgeRevisionResponse),
  errors: {
    400: ValidationErrorResponse,
    404: makeErrorResponse(z.literal("HTTP_ERROR")),
  },
} as const;

export const getEntryRevisionEndpoint = {
  method: "GET",
  path: "/api/entries/:id/revisions/:version",
  params: RevisionParams,
  response: KnowledgeRevisionResponse,
  errors: {
    400: ValidationErrorResponse,
    404: makeErrorResponse(z.literal("HTTP_ERROR")),
  },
} as const;

export const storeEntryEmbeddingEndpoint = {
  method: "PATCH",
  path: "/api/entries/:id/embedding",
  params: EntryParams,
  request: StoreEmbeddingRequest,
  errors: {
    400: ValidationErrorResponse,
    404: makeErrorResponse(z.literal("HTTP_ERROR")),
    409: makeErrorResponse(z.literal("HTTP_ERROR")),
  },
} as const;

export const searchEntriesEndpoint = {
  method: "POST",
  path: "/api/projects/:id/entries/search",
  params: ProjectParams,
  request: SearchRequest,
  response: z.array(SearchResultResponse),
  errors: {
    400: ValidationErrorResponse,
  },
} as const;
