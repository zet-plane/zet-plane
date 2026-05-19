import type {
	EdgeResponse,
	KnowledgeEntryResponse,
	NodeResponse,
} from "@zet-plane/contracts";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatAppDateTime } from "@/i18n/format";
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
	const { i18n, t } = useTranslation("graph");
	const { t: tCommon } = useTranslation("common");
	const language = i18n.resolvedLanguage === "zh-CN" ? "zh-CN" : "en";
	const selected = selectedNodeId
		? (nodes.find((n) => n.id === selectedNodeId) ?? null)
		: null;
	const { data: entries } = useNodeEntries(projectId, selectedNodeId);

	if (!selected) {
		return (
			<div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
				{t("inspector.emptySelection")}
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
					{t(`nodeTypeValue.${selected.type}`)} ·{" "}
					{t(`statusValue.${selected.status}`)}
				</div>
				<h2 className="mt-1 text-lg font-semibold">{selected.title}</h2>
				{selected.description && (
					<p className="mt-1 text-sm text-muted-foreground">
						{selected.description}
					</p>
				)}
			</header>

			<Section title={t("inspector.meta")}>
				<Field label={t("inspector.createdBy")} value={selected.createdBy} />
				<Field
					label={t("inspector.created")}
					value={formatAppDateTime(language, selected.createdAt)}
				/>
				<Field
					label={t("inspector.updated")}
					value={formatAppDateTime(language, selected.updatedAt)}
				/>
				{selected.isCheckpoint && (
					<Field
						label={t("legend.checkpoint")}
						value={selected.checkpointResolution ?? t("inspector.unresolved")}
					/>
				)}
			</Section>

			<Section
				title={t("inspector.knowledgeCount", { count: entries?.length ?? 0 })}
			>
				{!entries && (
					<div className="text-muted-foreground">
						{tCommon("state.loading")}
					</div>
				)}
				{entries && entries.length === 0 && (
					<div className="text-muted-foreground">
						{t("inspector.noKnowledgeEntries")}
					</div>
				)}
				{entries?.map((entry) => (
					<EntryRow key={entry.id} entry={entry} />
				))}
			</Section>

			<Section
				title={t("inspector.outgoingDependenciesCount", {
					count: outgoing.length,
				})}
			>
				{outgoing.length === 0 && (
					<div className="text-muted-foreground">{tCommon("state.none")}.</div>
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

			<Section
				title={t("inspector.incomingDependenciesCount", {
					count: incoming.length,
				})}
			>
				{incoming.length === 0 && (
					<div className="text-muted-foreground">{tCommon("state.none")}.</div>
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
