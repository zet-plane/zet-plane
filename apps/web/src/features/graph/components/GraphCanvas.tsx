import {
	Background,
	Controls,
	type Edge,
	MarkerType,
	type Node,
	ReactFlow,
	ReactFlowProvider,
} from '@xyflow/react';
import type { KnowledgeEntryResponse, NodeResponse } from '@zet-plane/contracts';
import { useCallback, useMemo } from 'react';
import '@xyflow/react/dist/style.css';
import { aggregateStatus } from '../domain/aggregate-status';
import { canvasView, type PeripheralStub as PeripheralStubModel } from '../domain/canvas-view';
import { getKnowledgeSummary, getOneHopEdgeIds } from '../domain/graph-workbench';
import type { ProjectGraph } from '../domain/types';
import { useCanvasNavigation } from '../hooks/use-canvas-navigation';
import { useLayoutedGraph } from '../layout/use-layouted-graph';
import { DependencyEdge } from './DependencyEdge';
import { EmptyState, ErrorState, LoadingState } from './EmptyState';
import { PeripheralStub } from './PeripheralStub';
import { Pill, type PillData } from './Pill';
import { StagingLane, type StagingLaneData } from './StagingLane';

const nodeTypes = { pill: Pill, peripheral: PeripheralStub, stagingLane: StagingLane };
const edgeTypes = { dependency: DependencyEdge };

const PERIPHERAL_GAP = 60;
const PERIPHERAL_WIDTH = 200;
const PERIPHERAL_HEIGHT = 36;
const PERIPHERAL_V_SPACING = 12;

type Props = {
	graph: ProjectGraph | undefined;
	entries?: KnowledgeEntryResponse[];
	isLoading: boolean;
	error: Error | null;
	onRetry?: () => void;
	selectedNodeId: string | null;
	onSelectNode: (id: string | null) => void;
};

export function GraphCanvas(props: Props) {
	return (
		<ReactFlowProvider>
			<CanvasInner {...props} />
		</ReactFlowProvider>
	);
}

function CanvasInner({
	graph,
	entries = [],
	isLoading,
	error,
	onRetry,
	selectedNodeId,
	onSelectNode,
}: Props) {
	const { focusedNodeId, diveInto } = useCanvasNavigation();

	const aggregation = useMemo(
		() => (graph ? aggregateStatus(graph) : new Map()),
		[graph],
	);

	const compositionChildCount = useMemo(() => {
		const counts = new Map<string, number>();
		if (!graph) return counts;
		for (const e of graph.edges) {
			if (e.type !== 'composition') continue;
			counts.set(e.fromId, (counts.get(e.fromId) ?? 0) + 1);
		}
		return counts;
	}, [graph]);

	const selectedOneHopEdgeIds = useMemo(
		() =>
			graph && selectedNodeId
				? getOneHopEdgeIds(graph.edges, selectedNodeId)
				: new Set<string>(),
		[graph, selectedNodeId],
	);
	const hasSelectedNode = selectedNodeId !== null;

	const view = useMemo(
		() => (graph ? canvasView(graph, focusedNodeId) : null),
		[graph, focusedNodeId],
	);

	const subGraphForLayout: ProjectGraph | undefined = useMemo(() => {
		if (!view) return undefined;
		return {
			nodes: view.children,
			edges: view.siblingDependencyEdges,
		};
	}, [view]);

	const { data: layouted, isLayouting, error: layoutErr } = useLayoutedGraph(subGraphForLayout);

	const onNodeClick = useCallback(
		(_: unknown, n: Node) => {
			if (n.type === 'stagingLane') return;
			onSelectNode(n.id);
		},
		[onSelectNode],
	);
	const onPaneClick = useCallback(() => onSelectNode(null), [onSelectNode]);

	if (isLoading) return <LoadingState message="Loading graph…" />;
	if (error) return <ErrorState error={error} onRetry={onRetry} />;
	if (layoutErr) return <ErrorState error={layoutErr} />;
	if (!view) return <EmptyState rootOnly />;
	if (isLayouting || !layouted) return <LoadingState message="Laying out…" />;

	const pillNodes: Node[] = layouted.nodes.map((n) => {
		const knowledgeSummary = getKnowledgeSummary(entries, n.id);
		const data: PillData = {
			node: n,
			aggregation: aggregation.get(n.id),
			knowledgeCount: knowledgeSummary.count,
			knowledgeCategories: knowledgeSummary.categories,
			childCount: compositionChildCount.get(n.id) ?? 0,
			selected: selectedNodeId === n.id,
			dimmed: false,
			onDive: diveInto,
		};
		return {
			id: n.id,
			type: 'pill',
			position: n.position,
			width: n.width,
			height: n.height,
			data: data as unknown as Record<string, unknown>,
			selectable: true,
			draggable: false,
		};
	});

	const childRects = new Map(
		layouted.nodes.map((n) => [
			n.id,
			{ x: n.position.x, y: n.position.y, width: n.width, height: n.height },
		]),
	);
	const childBbox = computeBbox(childRects.values());
	const peripheralPlacements = layoutPeripherals(
		view.peripheralStubs,
		childRects,
		selectedNodeId,
		diveInto,
	);
	const peripheralNodes: Node[] = peripheralPlacements.map((p) => p.node);
	const placementByStubId = new Map(peripheralPlacements.map((p) => [p.stubId, p.placement]));

	const peripheralEdges: Edge[] = view.peripheralStubs.flatMap((stub) => {
		const placement = placementByStubId.get(stub.external.id);
		if (!placement) return [];
		const childHandle = childHandleFor(placement, stub.side);
		const peripheralHandle = 'main';
		return stub.edges.map((e) => {
			const targetStatus =
				stub.side === 'right'
					? stub.external.status
					: (layouted.nodes.find((n) => n.id === e.toId)?.status ?? 'active');
			const childIsSource = stub.side === 'right';
			const selected = selectedOneHopEdgeIds.has(e.id);
			const dimmed = hasSelectedNode && !selected;
			return {
				id: e.id,
				source: e.fromId,
				target: e.toId,
				sourceHandle: childIsSource ? childHandle : peripheralHandle,
				targetHandle: childIsSource ? peripheralHandle : childHandle,
				markerEnd: directedMarker(targetStatus, selected, dimmed),
				type: 'dependency',
				data: {
					targetStatus,
					selected,
					dimmed,
					variant: 'peripheral',
				} as Record<string, unknown>,
			};
		});
	});

	const stagingNodes =
		graph?.nodes.filter((node) => node.role === 'staging_root' || node.type === 'staging') ??
		[];
	const stagingLaneData: StagingLaneData = {
		nodes: stagingNodes,
		selectedNodeId,
		onSelect: onSelectNode,
	};
	const stagingLaneNode: Node | null =
		view.isTopLevel && graph
			? {
					id: '__staging_lane__',
					type: 'stagingLane',
					position: { x: childBbox.maxX + 96, y: childBbox.minY },
					width: 280,
					height: Math.max(220, childBbox.maxY - childBbox.minY),
					data: stagingLaneData as unknown as Record<string, unknown>,
					selectable: false,
					draggable: false,
				}
			: null;

	const xyNodes: Node[] = [...pillNodes, ...peripheralNodes];
	if (stagingLaneNode) xyNodes.push(stagingLaneNode);

	const xyEdges: Edge[] = [
		...layouted.edges.map((e) => {
			const targetStatus = layouted.nodes.find((n) => n.id === e.toId)?.status ?? 'active';
			const selected = selectedOneHopEdgeIds.has(e.id);
			const dimmed = hasSelectedNode && !selected;
			return {
				id: e.id,
				source: e.fromId,
				target: e.toId,
				markerEnd: directedMarker(targetStatus, selected, dimmed),
				type: 'dependency',
				data: {
					targetStatus,
					selected,
					dimmed,
					variant: 'flow',
				} as Record<string, unknown>,
			};
		}),
		...peripheralEdges,
	];

	return (
		<div className="relative h-full w-full">
			<ReactFlow
				nodes={xyNodes}
				edges={xyEdges}
				nodeTypes={nodeTypes}
				edgeTypes={edgeTypes}
				onNodeClick={onNodeClick}
				onPaneClick={onPaneClick}
				onNodeDoubleClick={(_, n) => {
					const childCount = compositionChildCount.get(n.id) ?? 0;
					if (childCount > 0) diveInto(n.id);
				}}
				proOptions={{ hideAttribution: true }}
				fitView
			>
				<Background />
				<Controls />
			</ReactFlow>
		</div>
	);
}

function directedMarker(
	targetStatus: NodeResponse['status'],
	selected: boolean,
	dimmed: boolean,
) {
	const color = selected
		? 'var(--zp-edge-selected)'
		: dimmed
			? 'var(--zp-edge-dim)'
			: targetStatus === 'blocked'
				? 'var(--zp-status-blocked)'
				: 'var(--zp-edge-neutral)';
	return {
		type: MarkerType.ArrowClosed,
		width: 14,
		height: 14,
		color,
	};
}

type Rect = { x: number; y: number; width: number; height: number };
type Bbox = { minX: number; maxX: number; minY: number; maxY: number };
type Placement = 'top' | 'right' | 'bottom' | 'left';

function computeBbox(rects: Iterable<Rect>): Bbox {
	let minX = Infinity;
	let maxX = -Infinity;
	let minY = Infinity;
	let maxY = -Infinity;
	for (const r of rects) {
		minX = Math.min(minX, r.x);
		maxX = Math.max(maxX, r.x + r.width);
		minY = Math.min(minY, r.y);
		maxY = Math.max(maxY, r.y + r.height);
	}
	if (!Number.isFinite(minX)) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
	return { minX, maxX, minY, maxY };
}

// Pick the side of the bbox the anchor rect is closest to.
// This gives natural results regardless of the sub-graph's aspect:
//   - in a vertical column, the head child is closest to the top edge -> 'top';
//     the tail to 'bottom'; middle children's nearest edges are 'left' or 'right'.
//   - in a horizontal row, head/tail go to 'left'/'right'; middle to 'top'/'bottom'.
function pickPlacement(bbox: Bbox, anchor: Rect): Placement {
	const d = [
		{ d: anchor.y - bbox.minY, side: 'top' as Placement },
		{ d: bbox.maxX - (anchor.x + anchor.width), side: 'right' as Placement },
		{ d: bbox.maxY - (anchor.y + anchor.height), side: 'bottom' as Placement },
		{ d: anchor.x - bbox.minX, side: 'left' as Placement },
	];
	d.sort((a, b) => a.d - b.d);
	return d[0].side;
}

function rectsOverlap(a: Rect, b: Rect): boolean {
	return !(
		a.x + a.width <= b.x ||
		b.x + b.width <= a.x ||
		a.y + a.height <= b.y ||
		b.y + b.height <= a.y
	);
}

function slotAdjacentTo(anchor: Rect, placement: Placement): Rect {
	const cx = anchor.x + anchor.width / 2;
	const cy = anchor.y + anchor.height / 2;
	switch (placement) {
		case 'left':
			return {
				x: anchor.x - PERIPHERAL_GAP - PERIPHERAL_WIDTH,
				y: cy - PERIPHERAL_HEIGHT / 2,
				width: PERIPHERAL_WIDTH,
				height: PERIPHERAL_HEIGHT,
			};
		case 'right':
			return {
				x: anchor.x + anchor.width + PERIPHERAL_GAP,
				y: cy - PERIPHERAL_HEIGHT / 2,
				width: PERIPHERAL_WIDTH,
				height: PERIPHERAL_HEIGHT,
			};
		case 'top':
			return {
				x: cx - PERIPHERAL_WIDTH / 2,
				y: anchor.y - PERIPHERAL_GAP - PERIPHERAL_HEIGHT,
				width: PERIPHERAL_WIDTH,
				height: PERIPHERAL_HEIGHT,
			};
		case 'bottom':
			return {
				x: cx - PERIPHERAL_WIDTH / 2,
				y: anchor.y + anchor.height + PERIPHERAL_GAP,
				width: PERIPHERAL_WIDTH,
				height: PERIPHERAL_HEIGHT,
			};
	}
}

export type PeripheralLayout = {
	stubId: string;
	placement: Placement;
	node: Node;
};

function layoutPeripherals(
	stubs: PeripheralStubModel[],
	childRects: Map<string, Rect>,
	selectedNodeId: string | null,
	onJump: (id: string) => void,
): PeripheralLayout[] {
	if (stubs.length === 0 || childRects.size === 0) return [];
	const bbox = computeBbox(childRects.values());

	type Placed = {
		stub: PeripheralStubModel;
		placement: Placement;
		x: number;
		y: number;
	};

	const placed: Placed[] = [];
	const occupied: Rect[] = [...childRects.values()];

	for (const stub of stubs) {
		const connected: Rect[] = [];
		for (const e of stub.edges) {
			const childId = stub.side === 'left' ? e.toId : e.fromId;
			const rect = childRects.get(childId);
			if (rect) connected.push(rect);
		}
		if (connected.length === 0) continue;

		// Anchor = bounding rect of all connected children.
		const a = computeBbox(connected);
		const anchor: Rect = {
			x: a.minX,
			y: a.minY,
			width: a.maxX - a.minX,
			height: a.maxY - a.minY,
		};

		const placement = pickPlacement(bbox, anchor);
		const slot = slotAdjacentTo(anchor, placement);

		// Resolve collisions with previously-placed nodes by sliding perpendicular
		// to the placement axis.
		while (occupied.some((r) => rectsOverlap(r, slot))) {
			switch (placement) {
				case 'left':
				case 'right':
					slot.y += PERIPHERAL_HEIGHT + PERIPHERAL_V_SPACING;
					break;
				case 'top':
				case 'bottom':
					slot.x += PERIPHERAL_WIDTH + PERIPHERAL_V_SPACING;
					break;
			}
		}
		occupied.push({ ...slot });
		placed.push({ stub, placement, x: slot.x, y: slot.y });
	}

	return placed.map((p) => ({
		stubId: p.stub.external.id,
		placement: p.placement,
		node: {
			id: p.stub.external.id,
			type: 'peripheral',
			position: { x: p.x, y: p.y },
			width: PERIPHERAL_WIDTH,
			height: PERIPHERAL_HEIGHT,
			data: {
				node: p.stub.external,
				placement: p.placement,
				direction: p.stub.side === 'left' ? 'incoming' : 'outgoing',
				selected: selectedNodeId === p.stub.external.id,
				jumpTargetId: p.stub.jumpTargetId,
				onJump,
			} as unknown as Record<string, unknown>,
			selectable: true,
			draggable: false,
		},
	}));
}

// Pick the child-side handle id based on the peripheral's perimeter placement
// and the edge direction (stub.side carries the semantic: 'left' = incoming
// to a child, 'right' = outgoing from a child).
function childHandleFor(
	placement: Placement,
	stubSide: 'left' | 'right',
): string {
	const childIsSource = stubSide === 'right';
	switch (placement) {
		case 'left':
			return childIsSource ? 'l-s' : 'l-t';
		case 'right':
			return childIsSource ? 'r-s' : 'r-t';
		case 'top':
			return childIsSource ? 't-s' : 't-t';
		case 'bottom':
			return childIsSource ? 'b-s' : 'b-t';
	}
}
