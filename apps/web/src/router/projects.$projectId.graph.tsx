import { createFileRoute } from "@tanstack/react-router";
import { GraphCanvas } from "@/features/graph/components/GraphCanvas";
import { graphSearchSchema } from "@/lib/schemas/graph-search";

function GraphRoute() {
  const { projectId } = Route.useParams();
  return <GraphCanvas projectId={projectId} />;
}

export const Route = createFileRoute("/projects/$projectId/graph")({
  validateSearch: (raw) => graphSearchSchema.parse(raw),
  component: GraphRoute,
});
