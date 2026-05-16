import {
	Background,
	Controls,
	type Edge,
	type Node,
	ReactFlow,
	ReactFlowProvider,
} from '@xyflow/react';
import { useCallback, useMemo } from 'react';
import '@xyflow/react/dist/style.css';
import { aggregateStatus } from '../domain/aggregate-status';
import { breadcrumb } from '../domain/breadcrumb';
import { canvasView, type PeripheralStub as PeripheralStubModel } from '../domain/canvas-view';
import type { ProjectGraph } from '../domain/types';
import { useCanvasNavigation } from '../hooks/use-canvas-navigation';
import { useKnowledgeToggle } from '../hooks/use-knowledge-toggle';
import { useLayoutedGraph } from '../layout/use-layouted-graph';
import { Breadcrumb } from './Breadcrumb';
import { DependencyEdge } from './DependencyEdge';
import { EmptyState, ErrorState, LoadingState } from './EmptyState';
import { HeroToken } from './HeroToken';
import { KnowledgeToggle } from './KnowledgeToggle';
import { PeripheralStub } from './PeripheralStub';
import { Pill, type PillData } from './Pill';
import { StagingPanel } from './StagingPanel';

const nodeTypes = { pill: Pill, peripheral: PeripheralStub };
const edgeTypes = { dependency: DependencyEdge };

const PERIPHERAL_GAP = 140;
const PERIPHERAL_WIDTH = 200;
const PERIPHERAL_HEIGHT = 36;
const PERIPHERAL_V_SPACING = 16;

type Props = {
	graph: ProjectGraph | undefined;
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

function CanvasInner({ graph, isLoading, error, onRetry, selectedNodeId, onSelectNode }: Props) {
	const { focusedNodeId, diveInto, diveUpTo } = useCanvasNavigation();
	const knowledge = useKnowledgeToggle();

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

	const view = useMemo(
		() => (graph ? canvasView(graph, focusedNodeId) : null),
		[graph, focusedNodeId],
	);

	const crumbs = useMemo(
		() => (graph ? breadcrumb(graph, focusedNodeId) : []),
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
		const data: PillData = {
			node: n,
			aggregation: aggregation.get(n.id),
			knowledgeCount: 0,
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
	const peripheralPlacements = layoutPeripherals(
		view.peripheralStubs,
		childRects,
		selectedNodeId,
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
			return {
				id: e.id,
				source: e.fromId,
				target: e.toId,
				sourceHandle: childIsSource ? childHandle : peripheralHandle,
				targetHandle: childIsSource ? peripheralHandle : childHandle,
				type: 'dependency',
				data: {
					targetStatus,
					dimmed: true,
					variant: 'peripheral',
				} as Record<string, unknown>,
			};
		});
	});

	const xyNodes: Node[] = [...pillNodes, ...peripheralNodes];

	const xyEdges: Edge[] = [
		...layouted.edges.map((e) => ({
			id: e.id,
			source: e.fromId,
			target: e.toId,
			type: 'dependency',
			data: {
				targetStatus: layouted.nodes.find((n) => n.id === e.toId)?.status ?? 'active',
				dimmed: false,
				variant: 'flow',
			} as Record<string, unknown>,
		})),
		...peripheralEdges,
	];

	const heroAggregation = aggregation.get(view.hero.id);

	return (
		<div className="relative flex h-full w-full">
			<div className="relative flex flex-1 flex-col">
				<div className="flex items-center justify-between border-b border-border px-3 py-2">
					<Breadcrumb segments={crumbs} onSegmentClick={(id) => diveUpTo(id)} />
					<KnowledgeToggle visible={knowledge.visible} onToggle={knowledge.toggle} />
				</div>
				<div className="flex justify-center px-6 py-4">
					<HeroToken node={view.hero} aggregation={heroAggregation} />
				</div>
				<div className="relative flex-1">
					<ReactFlow
						nodes={xyNodes}
						edges={xyEdges}
						nodeTypes={nodeTypes}
						edgeTypes={edgeTypes}
						onNodeClick={onNodeClick}
						onPaneClick={onPaneClick}
						onNodeDoubleClick={(_, n) => diveInto(n.id)}
						proOptions={{ hideAttribution: true }}
						fitView
					>
						<Background />
						<Controls />
					</ReactFlow>
				</div>
			</div>
			{view.isTopLevel && graph && (
				<StagingPanel nodes={graph.nodes} onSelect={(id) => diveInto(id)} />
			)}
		</div>
	);
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

function pickPlacement(bbox: Bbox, cx: number, cy: number): Placement {
	const midX = (bbox.minX + bbox.maxX) / 2;
	const midY = (bbox.minY + bbox.maxY) / 2;
	const halfW = Math.max(1, (bbox.maxX - bbox.minX) / 2);
	const halfH = Math.max(1, (bbox.maxY - bbox.minY) / 2);
	const nx = (cx - midX) / halfW;
	const ny = (cy - midY) / halfH;
	if (Math.abs(nx) >= Math.abs(ny)) return nx >= 0 ? 'right' : 'left';
	return ny >= 0 ? 'bottom' : 'top';
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
	for (const stub of stubs) {
		const connected: Rect[] = [];
		for (const e of stub.edges) {
			const childId = stub.side === 'left' ? e.toId : e.fromId;
			const rect = childRects.get(childId);
			if (rect) connected.push(rect);
		}
		if (connected.length === 0) continue;

		const centroidX =
			connected.reduce((s, r) => s + r.x + r.width / 2, 0) / connected.length;
		const centroidY =
			connected.reduce((s, r) => s + r.y + r.height / 2, 0) / connected.length;
		const placement = pickPlacement(bbox, centroidX, centroidY);

		let x: number;
		let y: number;
		switch (placement) {
			case 'left':
				x = bbox.minX - PERIPHERAL_GAP - PERIPHERAL_WIDTH;
				y = centroidY - PERIPHERAL_HEIGHT / 2;
				break;
			case 'right':
				x = bbox.maxX + PERIPHERAL_GAP;
				y = centroidY - PERIPHERAL_HEIGHT / 2;
				break;
			case 'top':
				x = centroidX - PERIPHERAL_WIDTH / 2;
				y = bbox.minY - PERIPHERAL_GAP - PERIPHERAL_HEIGHT;
				break;
			case 'bottom':
				x = centroidX - PERIPHERAL_WIDTH / 2;
				y = bbox.maxY + PERIPHERAL_GAP;
				break;
		}
		placed.push({ stub, placement, x, y });
	}

	// Per-side collision resolution along the side's parallel axis.
	const minVGap = PERIPHERAL_HEIGHT + PERIPHERAL_V_SPACING;
	const minHGap = PERIPHERAL_WIDTH + PERIPHERAL_V_SPACING;
	for (const side of ['left', 'right'] as const) {
		const row = placed.filter((p) => p.placement === side).sort((a, b) => a.y - b.y);
		for (let i = 1; i < row.length; i++) {
			if (row[i].y - row[i - 1].y < minVGap) row[i].y = row[i - 1].y + minVGap;
		}
	}
	for (const side of ['top', 'bottom'] as const) {
		const row = placed.filter((p) => p.placement === side).sort((a, b) => a.x - b.x);
		for (let i = 1; i < row.length; i++) {
			if (row[i].x - row[i - 1].x < minHGap) row[i].x = row[i - 1].x + minHGap;
		}
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
