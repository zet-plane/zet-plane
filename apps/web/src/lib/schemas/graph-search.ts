import { z } from "zod";

export const graphSearchSchema = z.object({
  selectedNodeId: z.string().optional(),
  zoom: z.number().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
});

export type GraphSearch = z.infer<typeof graphSearchSchema>;
