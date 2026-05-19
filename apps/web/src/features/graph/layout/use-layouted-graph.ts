import type { KnowledgeEntryResponse } from "@zet-plane/contracts";
import { useEffect, useMemo, useState } from "react";
import { measurePillSize, type PillVariant } from "../components/pill-geometry";
import { aggregateStatus } from "../domain/aggregate-status";
import { topologyHash } from "../domain/topology-hash";
import type {
	LayoutedGraph,
	LayoutedNode,
	ProjectGraph,
} from "../domain/types";
import { type LayoutInput, type LayoutOutput, layoutGraph } from "./elk-layout";

function variantFor(nodeType: string): PillVariant {
	if (nodeType === "scaffold") return "scaffold";
	if (nodeType === "growth") return "growth";
	return "default";
}

type LayoutState = {
	data: LayoutedGraph | undefined;
	isLayouting: boolean;
	error: Error | null;
};

type LayoutRunState = {
	layoutKey: string | undefined;
	layoutResult: LayoutOutput | undefined;
	isLayouting: boolean;
	error: Error | null;
};

type LayoutRun = {
	promise: Promise<LayoutOutput>;
	cancel: () => void;
};

function createLayoutKey(
	graph: ProjectGraph,
	knowledgeCountByNodeId: Map<string, number>,
): string {
	const textKey = graph.nodes
		.map(
			(node) =>
				[
					node.id,
					node.title,
					node.description,
					node.status,
					node.type,
					knowledgeCountByNodeId.get(node.id) ?? 0,
				] as const,
		)
		.sort(([leftId], [rightId]) => leftId.localeCompare(rightId));

	return JSON.stringify({
		topology: topologyHash(graph),
		text: textKey,
	});
}

function createSummaryNodeIds(graph: ProjectGraph): Set<string> {
	const aggregateById = aggregateStatus(graph);
	const nodesWithCompositionChildren = new Set<string>();

	for (const edge of graph.edges) {
		if (edge.type === "composition") {
			nodesWithCompositionChildren.add(edge.fromId);
		}
	}

	const summaryNodeIds = new Set<string>();
	for (const nodeId of nodesWithCompositionChildren) {
		const aggregation = aggregateById.get(nodeId);
		if (!aggregation) continue;
		const total =
			aggregation.counts.blocked +
			aggregation.counts.active +
			aggregation.counts.completed;
		if (total > 0) {
			summaryNodeIds.add(nodeId);
		}
	}

	return summaryNodeIds;
}

function createCompositionChildCount(graph: ProjectGraph): Map<string, number> {
	const counts = new Map<string, number>();
	for (const edge of graph.edges) {
		if (edge.type !== "composition") continue;
		counts.set(edge.fromId, (counts.get(edge.fromId) ?? 0) + 1);
	}
	return counts;
}

function createKnowledgeCountByNodeId(
	entries: KnowledgeEntryResponse[],
): Map<string, number> {
	const counts = new Map<string, number>();
	for (const entry of entries) {
		counts.set(entry.nodeId, (counts.get(entry.nodeId) ?? 0) + 1);
	}
	return counts;
}

function createLayoutInput(
	graph: ProjectGraph,
	knowledgeCountByNodeId: Map<string, number>,
): LayoutInput {
	const summaryNodeIds = createSummaryNodeIds(graph);
	const childCountByNodeId = createCompositionChildCount(graph);
	const nodes = graph.nodes.map((node) => {
		const { width, height } = measurePillSize({
			title: node.title,
			variant: variantFor(node.type),
			knowledgeCount: knowledgeCountByNodeId.get(node.id) ?? 0,
			childCount: childCountByNodeId.get(node.id) ?? 0,
			hasSummaryBar: summaryNodeIds.has(node.id),
		});

		return {
			id: node.id,
			width: Math.max(1, width),
			height: Math.max(1, height),
			parentId: null,
		};
	});
	const edges = graph.edges.map((edge) => ({
		id: edge.id,
		fromId: edge.fromId,
		toId: edge.toId,
	}));

	return { nodes, edges };
}

function runLayoutInline(input: LayoutInput): LayoutRun {
	return {
		promise: layoutGraph(input),
		cancel: () => {},
	};
}

function mergeLayoutResult(
	graph: ProjectGraph,
	result: LayoutOutput,
): LayoutedGraph {
	const layoutById = new Map(result.nodes.map((node) => [node.id, node]));

	return {
		nodes: graph.nodes.map((node): LayoutedNode => {
			const layoutNode = layoutById.get(node.id);

			if (layoutNode === undefined) {
				throw new Error(`Missing layout result for node ${node.id}`);
			}

			return {
				...node,
				width: layoutNode.width,
				height: layoutNode.height,
				position: layoutNode.position,
				parentId: null,
			};
		}),
		edges: graph.edges,
	};
}

const EMPTY_ENTRIES: KnowledgeEntryResponse[] = [];

export function useLayoutedGraph(
	graph: ProjectGraph | undefined,
	entries: KnowledgeEntryResponse[] = EMPTY_ENTRIES,
): LayoutState {
	const [state, setState] = useState<LayoutRunState>({
		layoutKey: undefined,
		layoutResult: undefined,
		isLayouting: true,
		error: null,
	});

	const knowledgeCountByNodeId = useMemo(
		() => createKnowledgeCountByNodeId(entries),
		[entries],
	);

	const layoutKey = useMemo(() => {
		return graph === undefined
			? undefined
			: createLayoutKey(graph, knowledgeCountByNodeId);
	}, [graph, knowledgeCountByNodeId]);

	const data = useMemo(() => {
		if (
			graph === undefined ||
			layoutKey === undefined ||
			state.layoutKey !== layoutKey ||
			state.layoutResult === undefined
		) {
			return undefined;
		}

		return mergeLayoutResult(graph, state.layoutResult);
	}, [graph, layoutKey, state.layoutKey, state.layoutResult]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: layoutKey is a content hash of graph; depending on graph would trigger redundant layouts on identical inputs.
	useEffect(() => {
		let cancelled = false;

		if (graph === undefined || layoutKey === undefined) {
			setState({
				layoutKey: undefined,
				layoutResult: undefined,
				isLayouting: true,
				error: null,
			});
			return () => {
				cancelled = true;
			};
		}

		setState((current) => ({
			layoutKey: current.layoutKey,
			layoutResult: current.layoutResult,
			isLayouting: true,
			error: null,
		}));

		const input = createLayoutInput(graph, knowledgeCountByNodeId);
		const run = runLayoutInline(input);

		void run.promise
			.then((result: LayoutOutput) => {
				if (cancelled) {
					return;
				}

				setState({
					layoutKey,
					layoutResult: result,
					isLayouting: false,
					error: null,
				});
			})
			.catch((error: unknown) => {
				if (cancelled) {
					return;
				}

				setState({
					layoutKey: undefined,
					layoutResult: undefined,
					isLayouting: false,
					error: error instanceof Error ? error : new Error("Layout failed"),
				});
			});

		return () => {
			cancelled = true;
			run.cancel();
		};
	}, [layoutKey]);

	return {
		data,
		isLayouting: state.isLayouting,
		error: state.error,
	};
}
