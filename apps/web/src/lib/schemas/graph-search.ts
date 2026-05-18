import { z } from "zod";

export const graphViewSchema = z.enum(["diagnose", "explore"]);
export type GraphView = z.infer<typeof graphViewSchema>;

const stripUnknownKnowledgeMode = (value: unknown) => {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		return value;
	}

	const record = value as Record<string, unknown>;
	if (!("knowledge" in record) || record.knowledge === "nodes") {
		return value;
	}

	const { knowledge: _knowledge, ...rest } = record;
	return rest;
};

export const graphSearchSchema = z.preprocess(
	stripUnknownKnowledgeMode,
	z.object({
		view: z.catch(graphViewSchema, "diagnose").default("diagnose"),
		nodeId: z.string().min(1).optional(),
		focus: z.string().min(1).optional(),
		query: z.string().optional(),
		knowledge: z.literal("nodes").optional(),
	})
		.strip(),
);

export type GraphSearch = z.infer<typeof graphSearchSchema>;
