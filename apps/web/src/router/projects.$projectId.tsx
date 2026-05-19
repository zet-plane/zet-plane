import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { getProjectEndpoint } from "@zet-plane/contracts";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ProjectSwitcher } from "@/features/graph/components/ProjectSwitcher";
import { LanguageSwitcher } from "@/i18n/LanguageSwitcher";
import { apiCall } from "@/lib/api-client";

function ProjectShell() {
	const { projectId } = Route.useParams();
	const [sidebarOpen, setSidebarOpen] = useState(false);
	const { t } = useTranslation("projects");
	const { data: project } = useQuery({
		queryKey: ["project", projectId, "meta"],
		queryFn: () => apiCall(getProjectEndpoint, { params: { id: projectId } }),
	});
	const sidebarLabel = sidebarOpen
		? t("shell.collapseSidebar")
		: t("shell.expandSidebar");

	return (
		<div
			className="grid h-screen w-screen grid-rows-[48px_1fr] bg-background text-foreground"
			style={{
				gridTemplateColumns: sidebarOpen ? "220px 1fr" : "0px 1fr",
				transition: "grid-template-columns 180ms ease",
			}}
		>
			<header className="col-span-2 flex items-center gap-2 border-b border-border px-4 text-sm">
				<button
					type="button"
					onClick={() => setSidebarOpen((v) => !v)}
					className="rounded p-1 text-muted-foreground hover:bg-accent"
					aria-label={sidebarLabel}
					aria-expanded={sidebarOpen}
					title={sidebarLabel}
				>
					{sidebarOpen ? (
						<PanelLeftClose size={16} />
					) : (
						<PanelLeftOpen size={16} />
					)}
				</button>
				<Link to="/projects" className="text-muted-foreground hover:underline">
					{t("shell.projects")}
				</Link>
				<span className="text-muted-foreground">/</span>
				<span className="font-medium">{project?.name ?? projectId}</span>
				<span className="text-muted-foreground">/</span>
				<span className="text-muted-foreground">{t("shell.graph")}</span>
				<div className="ml-auto">
					<LanguageSwitcher />
				</div>
			</header>
			<aside
				className="row-start-2 flex flex-col gap-3 overflow-hidden border-r border-border p-2 text-sm"
				aria-hidden={!sidebarOpen}
			>
				{sidebarOpen && (
					<>
						<ProjectSwitcher activeProjectId={projectId} />
						<nav className="flex flex-col gap-1">
							<Link
								to="/projects/$projectId/graph"
								params={{ projectId }}
								search={{ view: "diagnose" }}
								className="rounded px-2 py-1 hover:bg-accent"
								activeProps={{
									className: "rounded px-2 py-1 bg-accent font-medium",
								}}
							>
								{t("shell.graph")}
							</Link>
						</nav>
					</>
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
