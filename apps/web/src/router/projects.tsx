import { createFileRoute, Link } from "@tanstack/react-router";
import { useProjectsList } from "@/features/projects/hooks/use-projects-list";

function ProjectsListPage() {
  const { data, isLoading, error } = useProjectsList();

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Loading projects…</div>;
  if (error) return <div className="p-8 text-sm text-destructive">Failed to load projects: {error.message}</div>;
  if (!data || data.length === 0) {
    return <div className="p-8 text-sm text-muted-foreground">No projects yet.</div>;
  }

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">Projects</h1>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {data.map((p) => (
          <li key={p.id}>
            <Link
              to="/projects/$projectId/graph"
              params={{ projectId: p.id }}
              className="flex items-baseline justify-between px-4 py-3 hover:bg-accent"
            >
              <span className="text-base font-medium">{p.name}</span>
              <span className="text-xs text-muted-foreground">
                Updated {new Date(p.updatedAt).toLocaleDateString()}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export const Route = createFileRoute("/projects")({
  component: ProjectsListPage,
});
