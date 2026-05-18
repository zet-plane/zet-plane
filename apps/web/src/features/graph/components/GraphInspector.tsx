import type {
	EdgeResponse,
	KnowledgeEntryResponse,
	NodeResponse,
} from "@zet-plane/contracts";
import { useState } from "react";
import { getKnowledgeSummary, getNodeById } from "../domain/graph-workbench";
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
	const selectedEntries = entries.filter((entry) => entry.nodeId === selected.id);

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

			<Section title="Meta">
				<Field label="Created by" value={selected.createdBy} />
				<Field label="Created" value={formatDate(selected.createdAt)} />
				<Field label="Updated" value={formatDate(selected.updatedAt)} />
				{selected.isCheckpoint && (
					<Field
						label="Checkpoint"
						value={selected.checkpointResolution ?? "unresolved"}
					/>
				)}
			</Section>

			<Section title="Flow impact">
				<DependencyRows
					edges={edges}
					nodes={nodes}
					selectedNodeId={selected.id}
					onSelectNode={onSelectNode}
				/>
			</Section>

			<Section title={`Knowledge evidence (${selectedEntries.length})`}>
				<EvidenceRows entries={selectedEntries} />
			</Section>
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
	const dependencies =
		graph?.edges.filter((edge) => edge.type === "dependency").length ?? 0;
	const blocked = nodes.filter((node) => node.status === "blocked").length;
	const checkpoints = nodes.filter((node) => node.isCheckpoint).length;
	const scopedEntries = focused
		? entries.filter((entry) => entry.nodeId === focused.id)
		: entries;
	const summary = focused
		? getKnowledgeSummary(entries, focused.id)
		: {
				count: entries.length,
				pitfallCount: entries.filter((entry) => entry.category === "pitfall")
					.length,
				categories: Array.from(
					new Set(entries.map((entry) => entry.category)),
				).sort(),
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
					`Project ${projectId} has ${nodes.length} nodes and ${dependencies} dependency edges.`}
			</p>

			<div className="mt-4 grid grid-cols-2 gap-2">
				<Metric label="Nodes" value={nodes.length} />
				<Metric label="Blocked" value={blocked} />
				<Metric label="Checkpoints" value={checkpoints} />
				<Metric label="Evidence" value={summary.count} />
			</div>

			<Section title="Knowledge summary">
				<Field label="Pitfalls" value={String(summary.pitfallCount)} />
				<Field
					label="Categories"
					value={summary.categories.length > 0 ? summary.categories.join(", ") : "None"}
				/>
			</Section>

			<Section title="Recent evidence">
				<EvidenceRows entries={scopedEntries.slice(0, 4)} />
			</Section>
		</div>
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
