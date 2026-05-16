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
import { canvasView } from '../domain/canvas-view';
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

const nodeTypes = { pill: Pill };
const edgeTypes = { dependency: DependencyEdge };

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

	const xyNodes: Node[] = layouted.nodes.map((n) => {
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

	const xyEdges: Edge[] = layouted.edges.map((e) => ({
		id: e.id,
		source: e.fromId,
		target: e.toId,
		type: 'dependency',
		data: {
			targetStatus: layouted.nodes.find((n) => n.id === e.toId)?.status ?? 'active',
			dimmed: false,
			variant: 'flow',
		} as Record<string, unknown>,
	}));

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
					{view.peripheralStubs.length > 0 && (
						<div className="pointer-events-none absolute inset-y-0 right-2 flex flex-col justify-center gap-2">
							{view.peripheralStubs
								.filter((s) => s.side === 'right')
								.map((s) => (
									<div key={s.external.id} className="pointer-events-auto">
										<PeripheralStub node={s.external} onJump={diveInto} />
									</div>
								))}
						</div>
					)}
					{view.peripheralStubs.some((s) => s.side === 'left') && (
						<div className="pointer-events-none absolute inset-y-0 left-2 flex flex-col justify-center gap-2">
							{view.peripheralStubs
								.filter((s) => s.side === 'left')
								.map((s) => (
									<div key={s.external.id} className="pointer-events-auto">
										<PeripheralStub node={s.external} onJump={diveInto} />
									</div>
								))}
						</div>
					)}
				</div>
			</div>
			{view.isTopLevel && graph && (
				<StagingPanel nodes={graph.nodes} onSelect={(id) => diveInto(id)} />
			)}
		</div>
	);
}
