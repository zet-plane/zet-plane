import { z } from "zod";

export const graphSearchSchema = z
	.object({
		nodeId: z.string().min(1).optional(),
		focus: z.string().min(1).optional(),
	})
	.strip();

export type GraphSearch = z.infer<typeof graphSearchSchema>;
