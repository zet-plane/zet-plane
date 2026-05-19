import type { BreadcrumbSegment } from "../domain/breadcrumb";
import { breadcrumb } from "../domain/breadcrumb";
import type { ProjectGraph } from "../domain/types";
import { useCanvasNavigation } from "../hooks/use-canvas-navigation";

type GraphView = "diagnose" | "explore";

type Props = {
	graph: ProjectGraph | undefined;
	view: GraphView;
	knowledgeNodesVisible: boolean;
	dataUpdatedAt: number;
	isFetching: boolean;
	onRefresh: () => void;
	onViewChange: (view: GraphView) => void;
	onKnowledgeNodesVisibleChange: (visible: boolean) => void;
};

export function GraphTopBar({
	graph,
	view,
	knowledgeNodesVisible,
	dataUpdatedAt,
	isFetching,
	onRefresh,
	onViewChange,
	onKnowledgeNodesVisibleChange,
}: Props) {
	const { focusedNodeId, diveUpTo } = useCanvasNavigation();
	const root = graph?.nodes.find((node) => node.isProjectRoot);
	const projectTitle = root?.title ?? "Graph workbench";
	const segments = compactBreadcrumb(
		graph ? breadcrumb(graph, focusedNodeId) : [],
	);
	const updatedLabel =
		dataUpdatedAt > 0
			? `Updated ${new Date(dataUpdatedAt).toLocaleTimeString()}`
			: "No graph data";

	return (
		<header className="zp-topbar flex min-h-14 items-center gap-3 border-b border-border bg-background px-4 text-sm">
			<div className="min-w-0 flex-1">
				<div className="zp-topbar__project truncate text-sm font-semibold text-foreground">
					{projectTitle}
				</div>
				<nav
					className="zp-topbar__crumbs mt-1 flex min-w-0 items-center gap-1 overflow-hidden text-xs text-muted-foreground"
					aria-label="Graph breadcrumb"
				>
					{segments.length === 0 ? (
						<span>Graph</span>
					) : (
						segments.map((segment, index) => (
							<span
								key={segment.kind === "ellipsis" ? "ellipsis" : segment.id}
								className="flex min-w-0 items-center gap-1"
							>
								{index > 0 && <span aria-hidden="true">/</span>}
								{segment.kind === "ellipsis" ? (
									<span className="px-1 py-0.5">...</span>
								) : (
									<button
										type="button"
										onClick={() => diveUpTo(segment.isRoot ? null : segment.id)}
										className="max-w-44 truncate rounded px-1 py-0.5 text-left hover:bg-accent hover:text-foreground"
									>
										{segment.title}
									</button>
								)}
							</span>
						))
					)}
				</nav>
			</div>

			<fieldset className="zp-topbar__switch flex shrink-0 overflow-hidden rounded-md border border-border">
				<legend className="sr-only">Graph view</legend>
				<button
					type="button"
					aria-pressed={view === "diagnose"}
					onClick={() => onViewChange("diagnose")}
					className="px-3 py-1.5 text-xs font-medium hover:bg-accent aria-pressed:bg-primary aria-pressed:text-primary-foreground"
				>
					Diagnose
				</button>
				<button
					type="button"
					aria-pressed={view === "explore"}
					onClick={() => onViewChange("explore")}
					className="border-l border-border px-3 py-1.5 text-xs font-medium hover:bg-accent aria-pressed:bg-primary aria-pressed:text-primary-foreground"
				>
					Explore
				</button>
			</fieldset>

			<button
				type="button"
				aria-pressed={knowledgeNodesVisible}
				onClick={() => onKnowledgeNodesVisibleChange(!knowledgeNodesVisible)}
				className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
			>
				Knowledge nodes
			</button>
			<button
				type="button"
				onClick={onRefresh}
				disabled={isFetching}
				className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent disabled:opacity-50"
				title={updatedLabel}
			>
				{isFetching ? "Refreshing..." : "Refresh"}
			</button>
		</header>
	);
}

type CompactBreadcrumbSegment =
	| (BreadcrumbSegment & { kind: "segment" })
	| { kind: "ellipsis" };

function compactBreadcrumb(
	segments: BreadcrumbSegment[],
): CompactBreadcrumbSegment[] {
	const withKind = (segment: BreadcrumbSegment): CompactBreadcrumbSegment => ({
		...segment,
		kind: "segment",
	});

	if (segments.length <= 3) return segments.map(withKind);

	return [
		withKind(segments[0]),
		{ kind: "ellipsis" },
		withKind(segments[segments.length - 2]),
		withKind(segments[segments.length - 1]),
	];
}
