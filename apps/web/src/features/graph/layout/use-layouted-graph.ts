import type { KnowledgeEntryResponse } from "@zet-plane/contracts";
import { useEffect, useMemo, useState } from "react";
import { measurePillSize, type PillVariant } from "../components/pill-geometry";
import { topologyHash } from "../domain/topology-hash";
import type {
	LayoutedGraph,
	LayoutedNode,
	ProjectGraph,
} from "../domain/types";
import { type LayoutInput, type LayoutOutput, layoutGraph } from "./elk-layout";
import { resetMeasureCache } from "./measure-text";

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
	geometryGraph: ProjectGraph = graph,
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
		geometryTopology: topologyHash(geometryGraph),
		text: textKey,
	});
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
	geometryGraph: ProjectGraph = graph,
): LayoutInput {
	const childCountByNodeId = createCompositionChildCount(geometryGraph);
	const nodes = graph.nodes.map((node) => {
		const { width, height } = measurePillSize({
			title: node.title,
			variant: variantFor(node.type),
			knowledgeCount: knowledgeCountByNodeId.get(node.id) ?? 0,
			childCount: childCountByNodeId.get(node.id) ?? 0,
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

function hasFontsApi(): boolean {
	if (typeof document === "undefined") return false;
	const fonts = (document as { fonts?: { ready?: Promise<unknown> } }).fonts;
	return fonts?.ready !== undefined;
}

function useFontsReady(): boolean {
	// Initial state must be `false` in real browsers: `document.fonts.status`
	// can read "loaded" before CSS-driven web fonts have started loading,
	// because no font requests are pending *yet*. We always wait for
	// `document.fonts.ready` so measurements happen against the typeface CSS
	// will actually render. In non-browser test envs (no FontFaceSet) we
	// short-circuit to `true` so server-side / jsdom tests don't hang.
	const [ready, setReady] = useState<boolean>(() => !hasFontsApi());

	useEffect(() => {
		if (ready) return;
		const fonts = (document as { fonts?: { ready?: Promise<unknown> } }).fonts;
		if (fonts?.ready === undefined) {
			setReady(true);
			return;
		}
		let cancelled = false;
		fonts.ready.then(() => {
			if (cancelled) return;
			// Drop widths measured with fallback fonts so the next layout
			// pass re-measures against the real (now-loaded) typeface.
			resetMeasureCache();
			setReady(true);
		});
		return () => {
			cancelled = true;
		};
	}, [ready]);

	return ready;
}

const EMPTY_ENTRIES: KnowledgeEntryResponse[] = [];

export function useLayoutedGraph(
	graph: ProjectGraph | undefined,
	entries: KnowledgeEntryResponse[] = EMPTY_ENTRIES,
	geometryGraph: ProjectGraph | undefined = graph,
): LayoutState {
	const fontsReady = useFontsReady();
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
			: createLayoutKey(graph, knowledgeCountByNodeId, geometryGraph ?? graph);
	}, [graph, geometryGraph, knowledgeCountByNodeId]);

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

		// Web fonts (e.g. Inter Variable) are async — measuring pill widths
		// before they load gives canvas measureText fallback-font results
		// that are narrower than the real CSS render, which makes ELK's
		// (correct) centering land on too-small wrappers. Defer until ready.
		if (!fontsReady) {
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

		const input = createLayoutInput(
			graph,
			knowledgeCountByNodeId,
			geometryGraph ?? graph,
		);
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
	}, [layoutKey, fontsReady]);

	return {
		data,
		isLayouting: state.isLayouting,
		error: state.error,
	};
}
