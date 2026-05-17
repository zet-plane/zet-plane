import type {
	EdgeResponse,
	KnowledgeEntryResponse,
	NodeResponse,
} from "@zet-plane/contracts";
import { useState } from "react";
import { useNodeEntries } from "../hooks/use-node-entries";

type Props = {
	projectId: string;
	nodes: NodeResponse[];
	edges: EdgeResponse[];
	selectedNodeId: string | null;
	onSelectNode: (id: string) => void;
};

export function DetailPanel({
	projectId,
	nodes,
	edges,
	selectedNodeId,
	onSelectNode,
}: Props) {
	const selected = selectedNodeId
		? (nodes.find((n) => n.id === selectedNodeId) ?? null)
		: null;
	const { data: entries } = useNodeEntries(projectId, selectedNodeId);

	if (!selected) {
		return (
			<div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
				Select a node to see details.
			</div>
		);
	}

	const outgoing = edges.filter(
		(e) => e.type === "dependency" && e.fromId === selected.id,
	);
	const incoming = edges.filter(
		(e) => e.type === "dependency" && e.toId === selected.id,
	);

	return (
		<div className="flex h-full flex-col overflow-auto p-4 text-sm">
			<header className="mb-3">
				<div className="text-xs uppercase tracking-wide text-muted-foreground">
					{selected.type} · {selected.status}
				</div>
				<h2 className="mt-1 text-lg font-semibold">{selected.title}</h2>
				{selected.description && (
					<p className="mt-1 text-sm text-muted-foreground">
						{selected.description}
					</p>
				)}
			</header>

			<Section title="Meta">
				<Field label="Created by" value={selected.createdBy} />
				<Field
					label="Created"
					value={new Date(selected.createdAt).toLocaleString()}
				/>
				<Field
					label="Updated"
					value={new Date(selected.updatedAt).toLocaleString()}
				/>
				{selected.isCheckpoint && (
					<Field
						label="Checkpoint"
						value={selected.checkpointResolution ?? "unresolved"}
					/>
				)}
			</Section>

			<Section title={`Knowledge (${entries?.length ?? 0})`}>
				{!entries && <div className="text-muted-foreground">Loading…</div>}
				{entries && entries.length === 0 && (
					<div className="text-muted-foreground">No knowledge entries.</div>
				)}
				{entries &&
					entries.map((entry) => <EntryRow key={entry.id} entry={entry} />)}
			</Section>

			<Section title={`Outgoing dependencies (${outgoing.length})`}>
				{outgoing.length === 0 && (
					<div className="text-muted-foreground">None.</div>
				)}
				{outgoing.map((e) => {
					const target = nodes.find((n) => n.id === e.toId);
					return (
						<button
							key={e.id}
							type="button"
							onClick={() => onSelectNode(e.toId)}
							className="block w-full rounded px-2 py-1 text-left hover:bg-accent"
						>
							{target?.title ?? e.toId}{" "}
							<span className="text-xs text-muted-foreground">
								({target?.status ?? "?"})
							</span>
						</button>
					);
				})}
			</Section>

			<Section title={`Incoming dependencies (${incoming.length})`}>
				{incoming.length === 0 && (
					<div className="text-muted-foreground">None.</div>
				)}
				{incoming.map((e) => {
					const source = nodes.find((n) => n.id === e.fromId);
					return (
						<button
							key={e.id}
							type="button"
							onClick={() => onSelectNode(e.fromId)}
							className="block w-full rounded px-2 py-1 text-left hover:bg-accent"
						>
							{source?.title ?? e.fromId}{" "}
							<span className="text-xs text-muted-foreground">
								({source?.status ?? "?"})
							</span>
						</button>
					);
				})}
			</Section>
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
		<section className="mb-4">
			<h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
				{title}
			</h3>
			<div className="space-y-1">{children}</div>
		</section>
	);
}

function Field({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex justify-between gap-4">
			<span className="text-muted-foreground">{label}</span>
			<span>{value}</span>
		</div>
	);
}

function EntryRow({ entry }: { entry: KnowledgeEntryResponse }) {
	const [open, setOpen] = useState(false);
	return (
		<div className="rounded border border-border p-2">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className="flex w-full items-baseline justify-between text-left"
			>
				<span>
					<span className="text-xs uppercase tracking-wide text-muted-foreground">
						{entry.category}
					</span>{" "}
					<span className="font-medium">{entry.title}</span>
				</span>
				<span className="text-xs text-muted-foreground">{entry.status}</span>
			</button>
			{open && (
				<pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">
					{JSON.stringify(entry.body, null, 2)}
				</pre>
			)}
		</div>
	);
}
