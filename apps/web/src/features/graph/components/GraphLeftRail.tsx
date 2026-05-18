import type { NodeResponse } from "@zet-plane/contracts";
import { useMemo, useState } from "react";
import { countCompositionChildren } from "../domain/graph-workbench";
import type { ProjectGraph } from "../domain/types";

type GraphView = "diagnose" | "explore";

type Props = {
	graph: ProjectGraph | undefined;
	view: GraphView;
	query: string;
	selectedNodeId: string | null;
	onQueryChange: (query: string) => void;
	onSelectNode: (id: string | null) => void;
};

export function GraphLeftRail({
	graph,
	view,
	query,
	selectedNodeId,
	onQueryChange,
	onSelectNode,
}: Props) {
	const [collapsed, setCollapsed] = useState(false);
	const childCounts = useMemo(
		() => (graph ? countCompositionChildren(graph) : new Map<string, number>()),
		[graph],
	);
	const nodes = graph?.nodes ?? [];
	const attentionNodes = nodes.filter(
		(node) => node.status === "blocked" || node.isCheckpoint,
	);
	const normalizedQuery = query.trim().toLowerCase();
	const exploreNodes =
		normalizedQuery.length === 0
			? nodes.slice(0, 12)
			: nodes.filter(
					(node) =>
						node.title.toLowerCase().includes(normalizedQuery) ||
						(node.description ?? "").toLowerCase().includes(normalizedQuery),
				);

	return (
		<aside
			className={
				collapsed
					? "zp-left-rail zp-left-rail--collapsed flex w-12 shrink-0 flex-col border-r border-border bg-background"
					: "zp-left-rail flex w-72 shrink-0 flex-col border-r border-border bg-background"
			}
		>
			<div className="flex items-center justify-between border-b border-border p-2">
				{!collapsed && (
					<span className="text-xs font-semibold uppercase text-muted-foreground">
						{view === "diagnose" ? "Diagnose" : "Explore"}
					</span>
				)}
				<button
					type="button"
					onClick={() => setCollapsed((value) => !value)}
					aria-label={collapsed ? "Expand rail" : "Collapse rail"}
					className="rounded px-2 py-1 text-xs hover:bg-accent"
				>
					{collapsed ? ">" : "<"}
				</button>
			</div>

			{!collapsed && (
				<div className="min-h-0 flex-1 overflow-auto p-3">
					{view === "diagnose" ? (
						<DiagnoseRailContent
							nodes={attentionNodes}
							childCounts={childCounts}
							selectedNodeId={selectedNodeId}
							onSelectNode={onSelectNode}
						/>
					) : (
						<ExploreRailContent
							nodes={exploreNodes}
							query={query}
							selectedNodeId={selectedNodeId}
							onQueryChange={onQueryChange}
							onSelectNode={onSelectNode}
						/>
					)}
				</div>
			)}
		</aside>
	);
}

function DiagnoseRailContent({
	nodes,
	childCounts,
	selectedNodeId,
	onSelectNode,
}: {
	nodes: NodeResponse[];
	childCounts: Map<string, number>;
	selectedNodeId: string | null;
	onSelectNode: (id: string | null) => void;
}) {
	if (nodes.length === 0) {
		return (
			<div className="rounded-md border border-border p-3 text-sm text-muted-foreground">
				No blocked nodes or checkpoints in this graph.
			</div>
		);
	}

	return (
		<div className="space-y-2">
			<div className="text-xs text-muted-foreground">
				Blocked nodes and checkpoints
			</div>
			{nodes.map((node) => (
				<NodeButton
					key={node.id}
					node={node}
					meta={`${node.status} · ${childCounts.get(node.id) ?? 0} children`}
					selected={selectedNodeId === node.id}
					onSelectNode={onSelectNode}
				/>
			))}
		</div>
	);
}

function ExploreRailContent({
	nodes,
	query,
	selectedNodeId,
	onQueryChange,
	onSelectNode,
}: {
	nodes: NodeResponse[];
	query: string;
	selectedNodeId: string | null;
	onQueryChange: (query: string) => void;
	onSelectNode: (id: string | null) => void;
}) {
	return (
		<div className="space-y-3">
			<label className="block text-xs font-medium text-muted-foreground">
				Search graph
				<input
					type="search"
					value={query}
					onChange={(event) => onQueryChange(event.target.value)}
					placeholder="Search nodes"
					className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
				/>
			</label>
			<div className="space-y-2">
				{nodes.length === 0 ? (
					<div className="rounded-md border border-border p-3 text-sm text-muted-foreground">
						No nodes match the current search.
					</div>
				) : (
					nodes.map((node) => (
						<NodeButton
							key={node.id}
							node={node}
							meta={`${node.type} · ${node.status}`}
							selected={selectedNodeId === node.id}
							onSelectNode={onSelectNode}
						/>
					))
				)}
			</div>
		</div>
	);
}

function NodeButton({
	node,
	meta,
	selected,
	onSelectNode,
}: {
	node: NodeResponse;
	meta: string;
	selected: boolean;
	onSelectNode: (id: string | null) => void;
}) {
	return (
		<button
			type="button"
			onClick={() => onSelectNode(node.id)}
			className={
				selected
					? "block w-full rounded-md border border-primary bg-primary px-3 py-2 text-left text-primary-foreground"
					: "block w-full rounded-md border border-border px-3 py-2 text-left hover:bg-accent"
			}
		>
			<span className="block truncate text-sm font-medium">{node.title}</span>
			<span className="block text-xs opacity-75">{meta}</span>
		</button>
	);
}
