import type { NodeResponse } from "@zet-plane/contracts";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	buildAttentionGroups,
	buildCompositionParentMap,
	countCompositionChildren,
	type GraphWorkbenchFilters,
	getContextNodeIds,
	getNodeById,
} from "../domain/graph-workbench";
import type { ProjectGraph } from "../domain/types";
import { useCanvasNavigation } from "../hooks/use-canvas-navigation";

type GraphView = "diagnose" | "explore";

type Props = {
	graph: ProjectGraph | undefined;
	view: GraphView;
	query: string;
	selectedNodeId: string | null;
	onQueryChange: (query: string) => void;
	onSelectNode: (id: string | null) => void;
	filters?: GraphWorkbenchFilters;
	onFiltersChange?: (filters: GraphWorkbenchFilters) => void;
};

export function GraphLeftRail({
	graph,
	view,
	query,
	selectedNodeId,
	onQueryChange,
	onSelectNode,
	filters = { status: null, type: null },
	onFiltersChange,
}: Props) {
	const { t } = useTranslation("graph");
	const [collapsed, setCollapsed] = useState(false);
	const { focusedNodeId } = useCanvasNavigation();
	const childCounts = useMemo(
		() => (graph ? countCompositionChildren(graph) : new Map<string, number>()),
		[graph],
	);
	const nodes = graph?.nodes ?? [];
	const attentionGroups = useMemo(
		() => (graph ? buildAttentionGroups(graph, focusedNodeId, filters) : []),
		[graph, filters, focusedNodeId],
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
	const exploreContextIds = useMemo(() => {
		if (!graph) return new Set<string>();
		try {
			return getContextNodeIds(graph, focusedNodeId);
		} catch {
			return new Set<string>();
		}
	}, [graph, focusedNodeId]);
	const compositionParent = useMemo(
		() =>
			graph ? buildCompositionParentMap(graph) : new Map<string, string>(),
		[graph],
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
						{view === "diagnose" ? t("view.diagnose") : t("view.explore")}
					</span>
				)}
				<button
					type="button"
					onClick={() => setCollapsed((value) => !value)}
					aria-label={collapsed ? t("leftRail.expand") : t("leftRail.collapse")}
					className="rounded px-2 py-1 text-xs hover:bg-accent"
				>
					{collapsed ? ">" : "<"}
				</button>
			</div>

			{!collapsed && (
				<div className="min-h-0 flex-1 overflow-auto p-3">
					{view === "diagnose" ? (
						<DiagnoseRailContent
							groups={attentionGroups}
							childCounts={childCounts}
							filters={filters}
							selectedNodeId={selectedNodeId}
							onFiltersChange={onFiltersChange}
							onSelectNode={onSelectNode}
						/>
					) : (
						<ExploreRailContent
							nodes={exploreNodes}
							allNodes={nodes}
							currentCanvasIds={exploreContextIds}
							compositionParent={compositionParent}
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
	groups,
	childCounts,
	filters,
	selectedNodeId,
	onFiltersChange,
	onSelectNode,
}: {
	groups: ReturnType<typeof buildAttentionGroups>;
	childCounts: Map<string, number>;
	filters: GraphWorkbenchFilters;
	selectedNodeId: string | null;
	onFiltersChange?: (filters: GraphWorkbenchFilters) => void;
	onSelectNode: (id: string | null) => void;
}) {
	const { t } = useTranslation("graph");
	const hasActiveFilters = filters.status != null || filters.type != null;

	return (
		<div className="space-y-4">
			<FilterChips filters={filters} onFiltersChange={onFiltersChange} />
			{groups.length === 0 ? (
				<div className="rounded-md border border-border p-3 text-sm text-muted-foreground">
					{hasActiveFilters
						? t("leftRail.noFilterMatches")
						: t("leftRail.noAttentionItems")}
				</div>
			) : (
				groups.map((group) => (
					<section key={group.label} className="space-y-2">
						<h3 className="text-xs font-semibold uppercase text-muted-foreground">
							{translateAttentionGroup(t, group.label)}
						</h3>
						{group.nodes.map((node) => (
							<NodeButton
								key={node.id}
								node={node}
								meta={`${t(`statusValue.${node.status}`)} · ${t("leftRail.childrenCount", { count: childCounts.get(node.id) ?? 0 })}`}
								selected={selectedNodeId === node.id}
								onSelectNode={onSelectNode}
							/>
						))}
					</section>
				))
			)}
		</div>
	);
}

function FilterChips({
	filters,
	onFiltersChange,
}: {
	filters: GraphWorkbenchFilters;
	onFiltersChange?: (filters: GraphWorkbenchFilters) => void;
}) {
	const { t } = useTranslation("graph");
	const setStatus = (status: NodeResponse["status"]) => {
		onFiltersChange?.({
			...filters,
			status: filters.status === status ? null : status,
		});
	};
	const setType = (type: NodeResponse["type"]) => {
		onFiltersChange?.({
			...filters,
			type: filters.type === type ? null : type,
		});
	};

	return (
		<div className="space-y-2">
			<div className="flex flex-wrap gap-1">
				{(["blocked", "active", "completed"] as const).map((status) => (
					<button
						key={status}
						type="button"
						aria-pressed={filters.status === status}
						onClick={() => setStatus(status)}
						className="rounded border border-border px-2 py-1 text-xs hover:bg-accent aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
					>
						{t("leftRail.statusFilter", {
							status: t(`statusValue.${status}`),
						})}
					</button>
				))}
			</div>
			<div className="flex flex-wrap gap-1">
				{(["scaffold", "growth", "staging"] as const).map((type) => (
					<button
						key={type}
						type="button"
						aria-pressed={filters.type === type}
						onClick={() => setType(type)}
						className="rounded border border-border px-2 py-1 text-xs hover:bg-accent aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
					>
						{t("leftRail.typeFilter", { type: t(`nodeTypeValue.${type}`) })}
					</button>
				))}
			</div>
		</div>
	);
}

function ExploreRailContent({
	nodes,
	allNodes,
	currentCanvasIds,
	compositionParent,
	query,
	selectedNodeId,
	onQueryChange,
	onSelectNode,
}: {
	nodes: NodeResponse[];
	allNodes: NodeResponse[];
	currentCanvasIds: Set<string>;
	compositionParent: Map<string, string>;
	query: string;
	selectedNodeId: string | null;
	onQueryChange: (query: string) => void;
	onSelectNode: (id: string | null) => void;
}) {
	const { t } = useTranslation("graph");
	const currentNodes = nodes.filter((node) => currentCanvasIds.has(node.id));
	const elsewhereNodes = nodes.filter((node) => !currentCanvasIds.has(node.id));

	return (
		<div className="space-y-3">
			<label className="block text-xs font-medium text-muted-foreground">
				{t("leftRail.searchLabel")}
				<input
					type="search"
					value={query}
					onChange={(event) => onQueryChange(event.target.value)}
					placeholder={t("leftRail.searchPlaceholder")}
					className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
				/>
			</label>
			{nodes.length === 0 ? (
				<div className="rounded-md border border-border p-3 text-sm text-muted-foreground">
					{t("leftRail.noSearchMatches")}
				</div>
			) : (
				<div className="space-y-4">
					<ExploreNodeSection
						title={t("leftRail.currentCanvas")}
						nodes={currentNodes}
						selectedNodeId={selectedNodeId}
						getMeta={(node) =>
							`${t(`nodeTypeValue.${node.type}`)} · ${t(`statusValue.${node.status}`)}`
						}
						onSelectNode={onSelectNode}
					/>
					<ExploreNodeSection
						title={t("leftRail.elsewhere")}
						nodes={elsewhereNodes}
						selectedNodeId={selectedNodeId}
						getMeta={(node) =>
							t("leftRail.home", {
								title: homeCanvasLabel(node, allNodes, compositionParent, t),
							})
						}
						onSelectNode={onSelectNode}
					/>
				</div>
			)}
		</div>
	);
}

function ExploreNodeSection({
	title,
	nodes,
	selectedNodeId,
	getMeta,
	onSelectNode,
}: {
	title: string;
	nodes: NodeResponse[];
	selectedNodeId: string | null;
	getMeta: (node: NodeResponse) => string;
	onSelectNode: (id: string | null) => void;
}) {
	if (nodes.length === 0) return null;

	return (
		<section className="space-y-2">
			<h3 className="text-xs font-semibold uppercase text-muted-foreground">
				{title}
			</h3>
			{nodes.map((node) => (
				<NodeButton
					key={node.id}
					node={node}
					meta={getMeta(node)}
					selected={selectedNodeId === node.id}
					onSelectNode={onSelectNode}
				/>
			))}
		</section>
	);
}

function homeCanvasLabel(
	node: NodeResponse,
	nodes: NodeResponse[],
	compositionParent: Map<string, string>,
	t: ReturnType<typeof useTranslation<"graph">>["t"],
) {
	const parentId = compositionParent.get(node.id);
	const root = nodes.find((candidate) => candidate.isProjectRoot);
	if (!parentId || parentId === root?.id) return t("leftRail.projectGraph");
	return getNodeById(nodes, parentId)?.title ?? t("leftRail.projectGraph");
}

function translateAttentionGroup(
	t: ReturnType<typeof useTranslation<"graph">>["t"],
	label: string,
) {
	if (label === "Blocked") return t("status.blocked");
	if (label === "Checkpoints") return t("inspector.checkpoints");
	return label;
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
			onClick={() => onSelectNode(selected ? null : node.id)}
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
