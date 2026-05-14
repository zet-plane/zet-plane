import { createFileRoute, Outlet, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getProjectEndpoint } from "@zet-plane/contracts";
import { apiCall } from "@/lib/api-client";

function ProjectShell() {
  const { projectId } = Route.useParams();
  const { data: project } = useQuery({
    queryKey: ["project", projectId, "meta"],
    queryFn: () => apiCall(getProjectEndpoint, { params: { id: projectId } }),
  });

  return (
    <div className="grid h-screen w-screen grid-cols-[220px_1fr] grid-rows-[48px_1fr] bg-background text-foreground">
      <header className="col-span-2 flex items-center gap-2 border-b border-border px-4 text-sm">
        <Link to="/projects" className="text-muted-foreground hover:underline">Projects</Link>
        <span className="text-muted-foreground">/</span>
        <span className="font-medium">{project?.name ?? projectId}</span>
        <span className="text-muted-foreground">/</span>
        <span className="text-muted-foreground">Graph</span>
      </header>
      <aside className="row-start-2 border-r border-border p-3 text-sm">
        <nav className="flex flex-col gap-1">
          <Link
            to="/projects/$projectId/graph"
            params={{ projectId }}
            className="rounded px-2 py-1 hover:bg-accent"
            activeProps={{ className: "rounded px-2 py-1 bg-accent font-medium" }}
          >
            Graph
          </Link>
        </nav>
      </aside>
      <main className="row-start-2 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}

export const Route = createFileRoute("/projects/$projectId")({
  component: ProjectShell,
});
