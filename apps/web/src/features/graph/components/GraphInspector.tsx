import type {
	EdgeResponse,
	KnowledgeEntryResponse,
	NodeResponse,
} from "@zet-plane/contracts";
import { useMemo, useState } from "react";
import { canvasView } from "../domain/canvas-view";
import {
	buildCompositionParentMap,
	getContextGraphSummary,
	getContextNodeIds,
	getKnowledgeSummary,
	getNodeById,
} from "../domain/graph-workbench";
import type { ProjectGraph } from "../domain/types";
import { useCanvasNavigation } from "../hooks/use-canvas-navigation";

type GraphView = "diagnose" | "explore";

type Props = {
	projectId: string;
	graph: ProjectGraph | undefined;
	entries: KnowledgeEntryResponse[];
	view: GraphView;
	selectedNodeId: string | null;
	onSelectNode: (id: string | null) => void;
};

export function GraphInspector({
	projectId,
	graph,
	entries,
	view,
	selectedNodeId,
	onSelectNode,
}: Props) {
	const selected = getNodeById(graph?.nodes ?? [], selectedNodeId);
	const { focusedNodeId, diveUpTo } = useCanvasNavigation();
	const currentCanvasView = useMemo(() => {
		if (!graph) return null;
		try {
			return canvasView(graph, focusedNodeId);
		} catch {
			return null;
		}
	}, [graph, focusedNodeId]);

	if (!selected) {
		return (
			<aside className="zp-inspector w-80 shrink-0 overflow-auto border-l border-border bg-background p-4 text-sm">
				<GraphContextSummary
					projectId={projectId}
					graph={graph}
					entries={entries}
					view={view}
				/>
			</aside>
		);
	}

	const nodes = graph?.nodes ?? [];
	const edges = graph?.edges ?? [];
	const selectedEntries = entries.filter(
		(entry) => entry.nodeId === selected.id,
	);
	const selectedSummary = getKnowledgeSummary(entries, selected.id);
	const compositionParent = graph
		? buildCompositionParentMap(graph)
		: new Map<string, string>();
	const root = graph?.nodes.find((node) => node.isProjectRoot) ?? null;
	const homeParentId = compositionParent.get(selected.id) ?? null;
	const homeFocusId =
		homeParentId && homeParentId !== root?.id ? homeParentId : null;
	const homeNode = getNodeById(nodes, homeParentId);
	const selectedIsPeripheral =
		currentCanvasView?.peripheralStubs.some(
			(stub) => stub.external.id === selected.id,
		) ?? false;

	return (
		<aside className="zp-inspector w-80 shrink-0 overflow-auto border-l border-border bg-background p-4 text-sm">
			<header className="mb-4">
				<div className="zp-inspector__eyebrow text-xs uppercase text-muted-foreground">
					{selected.type} · {selected.status}
				</div>
				<div className="mt-1 flex items-start justify-between gap-3">
					<h2 className="text-base font-semibold leading-tight text-foreground">
						{selected.title}
					</h2>
					<button
						type="button"
						onClick={() => onSelectNode(null)}
						className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
						aria-label="Clear selected node"
					>
						Clear
					</button>
				</div>
				{selected.description && (
					<p className="mt-2 text-sm text-muted-foreground">
						{selected.description}
					</p>
				)}
			</header>

			{selectedIsPeripheral && (
				<Section title="External to current canvas">
					<Field
						label="Home canvas"
						value={homeNode?.title ?? "Project graph"}
					/>
					<button
						type="button"
						onClick={() => diveUpTo(homeFocusId)}
						className="mt-2 w-full rounded-md border border-border px-3 py-1.5 text-left text-xs font-medium hover:bg-accent"
					>
						Jump to home canvas
					</button>
				</Section>
			)}

			{view === "diagnose" ? (
				<>
					<Section title="Current meaning">
						<p className="text-muted-foreground">
							{selected.description ??
								"This node is part of the current project graph context."}
						</p>
					</Section>

					{selected.isCheckpoint && (
						<Section title="Checkpoint state">
							<Field
								label="Resolution"
								value={selected.checkpointResolution ?? "unresolved"}
							/>
						</Section>
					)}

					<Section title="Flow impact">
						<DependencyRows
							edges={edges}
							nodes={nodes}
							selectedNodeId={selected.id}
							onSelectNode={onSelectNode}
						/>
					</Section>

					<Section title={`Evidence (${selectedEntries.length})`}>
						<EvidenceRows entries={selectedEntries} />
					</Section>
				</>
			) : (
				<>
					<Section title="Knowledge summary">
						<Field label="Entries" value={String(selectedSummary.count)} />
						<Field
							label="Pitfalls"
							value={String(selectedSummary.pitfallCount)}
						/>
						<Field
							label="Categories"
							value={
								selectedSummary.categories.length > 0
									? selectedSummary.categories.join(", ")
									: "None"
							}
						/>
					</Section>

					<Section title={`Evidence list (${selectedEntries.length})`}>
						<EvidenceRows entries={selectedEntries} />
					</Section>

					<Section title="Related nodes">
						<DependencyRows
							edges={edges}
							nodes={nodes}
							selectedNodeId={selected.id}
							onSelectNode={onSelectNode}
						/>
					</Section>
				</>
			)}

			<CollapsibleSection title="Meta">
				<Field label="Created by" value={selected.createdBy} />
				<Field label="Created" value={formatDate(selected.createdAt)} />
				<Field label="Updated" value={formatDate(selected.updatedAt)} />
			</CollapsibleSection>
		</aside>
	);
}

function GraphContextSummary({
	projectId,
	graph,
	entries,
	view,
}: {
	projectId: string;
	graph: ProjectGraph | undefined;
	entries: KnowledgeEntryResponse[];
	view: GraphView;
}) {
	const { focusedNodeId } = useCanvasNavigation();
	const focused = getNodeById(graph?.nodes ?? [], focusedNodeId);
	const nodes = graph?.nodes ?? [];
	const contextIds = graph
		? getContextNodeIds(graph, focusedNodeId)
		: new Set<NodeResponse["id"]>();
	const scopedEntries = entries.filter((entry) => contextIds.has(entry.nodeId));
	const summary = graph
		? getContextGraphSummary(graph, entries, focusedNodeId)
		: {
				nodeCount: 0,
				blockedCount: 0,
				checkpointCount: 0,
				stagingCount: 0,
				dependencyCount: 0,
				evidenceCount: 0,
				pitfallCount: 0,
				categories: [],
			};

	return (
		<div>
			<div className="text-xs uppercase text-muted-foreground">
				{view} context
			</div>
			<h2 className="mt-1 text-base font-semibold text-foreground">
				{focused?.title ?? "Project graph"}
			</h2>
			<p className="mt-2 text-sm text-muted-foreground">
				{focused?.description ??
					`Project ${projectId} has ${nodes.length} nodes. This summary follows the current canvas context.`}
			</p>

			<div className="mt-4 grid grid-cols-2 gap-2">
				<Metric label="Blocked" value={summary.blockedCount} />
				<Metric label="Checkpoints" value={summary.checkpointCount} />
				<Metric label="Staging" value={summary.stagingCount} />
				<Metric label="Impacted" value={summary.dependencyCount} />
			</div>

			<div className="mt-2 grid grid-cols-2 gap-2">
				<Metric label="Nodes" value={summary.nodeCount} />
				<Metric label="Evidence" value={summary.evidenceCount} />
			</div>

			<Section title="Knowledge summary">
				<Field label="Pitfalls" value={String(summary.pitfallCount)} />
				<Field
					label="Categories"
					value={
						summary.categories.length > 0
							? summary.categories.join(", ")
							: "None"
					}
				/>
			</Section>

			<Section title="Recent evidence">
				<EvidenceRows entries={scopedEntries.slice(0, 4)} />
			</Section>
		</div>
	);
}

function CollapsibleSection({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	const [open, setOpen] = useState(false);

	return (
		<section className="mt-4 border-t border-border pt-3">
			<button
				type="button"
				onClick={() => setOpen((value) => !value)}
				aria-expanded={open}
				className="flex w-full items-center justify-between text-xs font-semibold uppercase text-muted-foreground hover:text-foreground"
			>
				<span>{title}</span>
				<span aria-hidden="true">{open ? "−" : "+"}</span>
			</button>
			{open && <div className="mt-2 space-y-1">{children}</div>}
		</section>
	);
}

function DependencyRows({
	edges,
	nodes,
	selectedNodeId,
	onSelectNode,
}: {
	edges: EdgeResponse[];
	nodes: NodeResponse[];
	selectedNodeId: string;
	onSelectNode: (id: string | null) => void;
}) {
	const incoming = edges.filter(
		(edge) => edge.type === "dependency" && edge.toId === selectedNodeId,
	);
	const outgoing = edges.filter(
		(edge) => edge.type === "dependency" && edge.fromId === selectedNodeId,
	);

	if (incoming.length === 0 && outgoing.length === 0) {
		return <div className="text-muted-foreground">No dependencies.</div>;
	}

	return (
		<div className="space-y-3">
			<DependencyGroup
				label="Outgoing"
				edges={outgoing}
				nodes={nodes}
				getTargetId={(edge) => edge.toId}
				onSelectNode={onSelectNode}
			/>
			<DependencyGroup
				label="Incoming"
				edges={incoming}
				nodes={nodes}
				getTargetId={(edge) => edge.fromId}
				onSelectNode={onSelectNode}
			/>
		</div>
	);
}

function DependencyGroup({
	label,
	edges,
	nodes,
	getTargetId,
	onSelectNode,
}: {
	label: string;
	edges: EdgeResponse[];
	nodes: NodeResponse[];
	getTargetId: (edge: EdgeResponse) => string;
	onSelectNode: (id: string | null) => void;
}) {
	if (edges.length === 0) return null;

	return (
		<div>
			<div className="mb-1 text-xs font-medium text-muted-foreground">
				{label}
			</div>
			<div className="space-y-1">
				{edges.map((edge) => {
					const targetId = getTargetId(edge);
					const target = getNodeById(nodes, targetId);
					return (
						<button
							key={edge.id}
							type="button"
							onClick={() => onSelectNode(targetId)}
							className="block w-full rounded-md border border-border px-2 py-1.5 text-left hover:bg-accent"
						>
							<span className="block truncate font-medium">
								{target?.title ?? targetId}
							</span>
							<span className="text-xs text-muted-foreground">
								{target?.status ?? "unknown"}
							</span>
						</button>
					);
				})}
			</div>
		</div>
	);
}

function EvidenceRows({ entries }: { entries: KnowledgeEntryResponse[] }) {
	if (entries.length === 0) {
		return <div className="text-muted-foreground">No knowledge evidence.</div>;
	}

	return (
		<div className="space-y-2">
			{entries.map((entry) => (
				<EntryRow key={entry.id} entry={entry} />
			))}
		</div>
	);
}

function EntryRow({ entry }: { entry: KnowledgeEntryResponse }) {
	const [open, setOpen] = useState(false);

	return (
		<div className="rounded-md border border-border p-2">
			<button
				type="button"
				onClick={() => setOpen((value) => !value)}
				className="flex w-full items-baseline justify-between gap-2 text-left"
			>
				<span className="min-w-0">
					<span className="block text-xs uppercase text-muted-foreground">
						{entry.category}
					</span>
					<span className="block truncate font-medium">{entry.title}</span>
				</span>
				<span className="shrink-0 text-xs text-muted-foreground">
					{entry.status}
				</span>
			</button>
			{open && (
				<pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs text-muted-foreground">
					{formatBody(entry.body)}
				</pre>
			)}
		</div>
	);
}

function Section({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<section className="mt-4">
			<h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
				{title}
			</h3>
			<div className="space-y-1">{children}</div>
		</section>
	);
}

function Field({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex justify-between gap-3">
			<span className="text-muted-foreground">{label}</span>
			<span className="text-right text-foreground">{value}</span>
		</div>
	);
}

function Metric({ label, value }: { label: string; value: number }) {
	return (
		<div className="rounded-md border border-border p-2">
			<div className="text-lg font-semibold text-foreground">{value}</div>
			<div className="text-xs text-muted-foreground">{label}</div>
		</div>
	);
}

function formatDate(value: string) {
	return new Date(value).toLocaleString();
}

function formatBody(body: unknown) {
	if (typeof body === "string") return body;
	return JSON.stringify(body, null, 2);
}
