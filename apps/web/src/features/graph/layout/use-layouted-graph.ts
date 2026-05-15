import type { NodeResponse } from "@zet-plane/contracts";
import { useEffect, useMemo, useState } from "react";
import { buildParentMap } from "../domain/build-parent-map";
import { topologyHash } from "../domain/topology-hash";
import type {
	LayoutedGraph,
	LayoutedNode,
	ProjectGraph,
} from "../domain/types";
import { type LayoutInput, type LayoutOutput, layoutGraph } from "./elk-layout";
import { measureNodeText } from "./measure-text";

const NODE_TITLE_FONT = "600 14px Inter Variable";
const NODE_TITLE_MAX_WIDTH = 220;
const NODE_TITLE_LINE_HEIGHT = 20;
const NODE_HORIZONTAL_PADDING = 24;
const NODE_VERTICAL_PADDING = 24;

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

function createLayoutKey(graph: ProjectGraph): string {
	const textKey = graph.nodes
		.map((node) => [node.id, node.title, node.description] as const)
		.sort(([leftId], [rightId]) => leftId.localeCompare(rightId));

	return JSON.stringify({
		topology: topologyHash(graph),
		text: textKey,
	});
}

function createLayoutInput(graph: ProjectGraph): LayoutInput {
	const parentMap = buildParentMap(graph);
	const nodes = graph.nodes.map((node) => {
		const textSize = measureNodeText({
			text: node.title,
			font: NODE_TITLE_FONT,
			maxWidth: NODE_TITLE_MAX_WIDTH,
			lineHeight: NODE_TITLE_LINE_HEIGHT,
		});

		return {
			id: node.id,
			width: Math.max(1, textSize.width + NODE_HORIZONTAL_PADDING * 2),
			height: Math.max(1, textSize.height + NODE_VERTICAL_PADDING * 2),
			parentId: parentMap.get(node.id) ?? null,
		};
	});
	const edges = graph.edges
		.filter((edge) => edge.type === "dependency")
		.map((edge) => ({
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
	parentMap: Map<NodeResponse["id"], NodeResponse["id"]>,
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
				parentId: parentMap.get(node.id) ?? null,
			};
		}),
		edges: graph.edges,
	};
}

export function useLayoutedGraph(graph: ProjectGraph | undefined): LayoutState {
	const [state, setState] = useState<LayoutRunState>({
		layoutKey: undefined,
		layoutResult: undefined,
		isLayouting: true,
		error: null,
	});

	const layoutKey = useMemo(() => {
		return graph === undefined ? undefined : createLayoutKey(graph);
	}, [graph]);

	const data = useMemo(() => {
		if (
			graph === undefined ||
			layoutKey === undefined ||
			state.layoutKey !== layoutKey ||
			state.layoutResult === undefined
		) {
			return undefined;
		}

		return mergeLayoutResult(graph, buildParentMap(graph), state.layoutResult);
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

		const input = createLayoutInput(graph);
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
