import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { getProjectEndpoint } from "@zet-plane/contracts";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useState } from "react";
import { ProjectSwitcher } from "@/features/graph/components/ProjectSwitcher";
import { apiCall } from "@/lib/api-client";

function ProjectShell() {
	const { projectId } = Route.useParams();
	const [sidebarOpen, setSidebarOpen] = useState(false);
	const { data: project } = useQuery({
		queryKey: ["project", projectId, "meta"],
		queryFn: () => apiCall(getProjectEndpoint, { params: { id: projectId } }),
	});

	return (
		<div
			className="grid h-screen w-screen grid-rows-[48px_1fr] bg-background text-foreground"
			style={{
				gridTemplateColumns: sidebarOpen ? "220px 1fr" : "40px 1fr",
				transition: "grid-template-columns 180ms ease",
			}}
		>
			<header className="col-span-2 flex items-center gap-2 border-b border-border px-4 text-sm">
				<button
					type="button"
					onClick={() => setSidebarOpen((v) => !v)}
					className="rounded p-1 text-muted-foreground hover:bg-accent"
					aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
					aria-expanded={sidebarOpen}
					title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
				>
					{sidebarOpen ? (
						<PanelLeftClose size={16} />
					) : (
						<PanelLeftOpen size={16} />
					)}
				</button>
				<Link to="/projects" className="text-muted-foreground hover:underline">
					Projects
				</Link>
				<span className="text-muted-foreground">/</span>
				<span className="font-medium">{project?.name ?? projectId}</span>
				<span className="text-muted-foreground">/</span>
				<span className="text-muted-foreground">Graph</span>
			</header>
			<aside className="row-start-2 flex flex-col gap-3 overflow-hidden border-r border-border p-2 text-sm">
				{sidebarOpen ? (
					<>
						<ProjectSwitcher activeProjectId={projectId} />
						<nav className="flex flex-col gap-1">
							<Link
								to="/projects/$projectId/graph"
								params={{ projectId }}
								className="rounded px-2 py-1 hover:bg-accent"
								activeProps={{
									className: "rounded px-2 py-1 bg-accent font-medium",
								}}
							>
								Graph
							</Link>
						</nav>
					</>
				) : (
					<button
						type="button"
						onClick={() => setSidebarOpen(true)}
						className="flex items-center justify-center rounded p-1 text-muted-foreground hover:bg-accent"
						aria-label="Open project switcher"
						title="Projects"
					>
						<PanelLeftOpen size={16} />
					</button>
				)}
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
