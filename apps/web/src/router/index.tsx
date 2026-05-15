import { createFileRoute } from "@tanstack/react-router";
import { ReactFlow, type Node, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useState } from "react";
import { graphSearchSchema } from "@/lib/schemas/graph-search";
import { useEndpointMutation } from "@/lib/use-endpoint";
import { createNodeEndpoint } from "@zet-plane/contracts";

const initialNodes: Node[] = [
  { id: "1", position: { x: 100, y: 100 }, data: { label: "Project Root" } },
  { id: "2", position: { x: 300, y: 250 }, data: { label: "Task A" } },
];

const initialEdges: Edge[] = [
  { id: "e1-2", source: "1", target: "2" },
];

function CreateNodePanel({ projectId }: { projectId: string }) {
  const [title, setTitle] = useState("");
  const mutation = useEndpointMutation(createNodeEndpoint);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    mutation.mutate(
      { params: { id: projectId }, body: { title: title.trim() } },
      { onSuccess: () => setTitle("") },
    );
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        position: "absolute",
        top: 16,
        right: 16,
        zIndex: 10,
        background: "white",
        border: "1px solid #e2e8f0",
        borderRadius: 8,
        padding: "12px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        minWidth: 240,
        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
      }}
    >
      <strong style={{ fontSize: 13 }}>Create node</strong>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Node title"
        disabled={mutation.isPending}
        style={{ padding: "4px 8px", border: "1px solid #cbd5e1", borderRadius: 4, fontSize: 13 }}
      />
      {mutation.isError && (
        <span style={{ color: "red", fontSize: 12 }}>
          {(mutation.error as Error).message}
        </span>
      )}
      {mutation.isSuccess && (
        <span style={{ color: "green", fontSize: 12 }}>
          Created: {mutation.data.id}
        </span>
      )}
      <button
        type="submit"
        disabled={mutation.isPending || !title.trim()}
        style={{ padding: "4px 12px", background: "#3b82f6", color: "white", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13 }}
      >
        {mutation.isPending ? "Creating…" : "Create"}
      </button>
    </form>
  );
}

function GraphPage() {
  const { projectId } = Route.useSearch();

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative" }} data-testid="graph-canvas">
      <ReactFlow nodes={initialNodes} edges={initialEdges} fitView />
      {projectId && <CreateNodePanel projectId={projectId} />}
    </div>
  );
}

export const Route = createFileRoute("/")({
  validateSearch: (raw) => graphSearchSchema.parse(raw),
  component: GraphPage,
});
