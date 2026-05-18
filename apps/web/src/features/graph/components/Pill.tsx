import { Handle, type Node, type NodeProps, Position } from '@xyflow/react';
import type { KnowledgeEntryResponse, NodeResponse } from '@zet-plane/contracts';
import { Flag } from 'lucide-react';
import { effectiveNodeStatus } from '../domain/effective-status';
import type { AggregatedStatus } from '../domain/types';

export type PillData = {
	node: NodeResponse;
	aggregation: AggregatedStatus | undefined;
	knowledgeCount: number;
	knowledgeCategories: KnowledgeEntryResponse['category'][];
	childCount: number;
	selected: boolean;
	dimmed: boolean;
	onDive?: (id: string) => void;
};

export type PillNode = Node<PillData>;

export function Pill({ data }: NodeProps<PillNode>) {
	const {
		node,
		aggregation,
		knowledgeCount,
		knowledgeCategories,
		childCount,
		selected,
		dimmed,
		onDive,
	} = data;
	const displayStatus = effectiveNodeStatus(node.status, aggregation);

	const classes = ['zp-pill', `zp-pill--${node.type}`, `zp-pill--${displayStatus}`];
	if (node.type === 'scaffold' && node.isCheckpoint) classes.push('zp-pill--checkpoint');
	if (selected) classes.push('zp-pill--selected');
	if (dimmed) classes.push('zp-pill--dimmed');

	const showAggBar = childCount > 0 && aggregation !== undefined;
	const counts = aggregation?.counts ?? { active: 0, blocked: 0, completed: 0, archived: 0 };

	const dive = () => {
		if (childCount > 0) onDive?.(node.id);
	};

	return (
		<div
			className={classes.join(' ')}
			onDoubleClick={(e) => {
				e.stopPropagation();
				dive();
			}}
		>
			{/* Defaults for sibling edges: top-target / bottom-source */}
			<Handle type="target" position={Position.Top} id="t-t" style={{ opacity: 0 }} />
			<Handle type="source" position={Position.Bottom} id="b-s" style={{ opacity: 0 }} />
			{/* Side handles for peripheral edges */}
			<Handle type="source" position={Position.Right} id="r-s" style={{ opacity: 0 }} />
			<Handle type="target" position={Position.Right} id="r-t" style={{ opacity: 0 }} />
			<Handle type="source" position={Position.Left} id="l-s" style={{ opacity: 0 }} />
			<Handle type="target" position={Position.Left} id="l-t" style={{ opacity: 0 }} />
			<Handle type="source" position={Position.Top} id="t-s" style={{ opacity: 0 }} />
			<Handle type="target" position={Position.Bottom} id="b-t" style={{ opacity: 0 }} />
			{node.type === 'scaffold' && node.isCheckpoint && (
				<span className="zp-pill__flag" aria-label="checkpoint">
					<Flag size={9} />
				</span>
			)}
			<span
				className={`zp-node-status zp-node-status--${displayStatus}`}
				aria-label={`Status: ${displayStatus}`}
			/>
			<span className="zp-pill__title">{node.title}</span>
			{knowledgeCount > 0 && (
				<span className="zp-probe-rail" aria-label={`${knowledgeCount} knowledge entries`}>
					{knowledgeCategories.slice(0, 3).map((category) => (
						<i key={category} className={`zp-probe-dot zp-probe-dot--${category}`} />
					))}
					<span className="zp-probe-count">{knowledgeCount}</span>
				</span>
			)}
			{childCount > 0 && (
				<button
					type="button"
					className="zp-pill__dive"
					aria-label={`Dive into ${node.title} (${childCount} children)`}
					onClick={(e) => {
						e.stopPropagation();
						dive();
					}}
				>
					↳{childCount}
				</button>
			)}
			{showAggBar && (
				<span className="zp-pill__agg" aria-hidden>
					<i className="zp-pill__agg-a" style={{ flex: counts.active }} />
					<i className="zp-pill__agg-b" style={{ flex: counts.blocked }} />
					<i className="zp-pill__agg-d" style={{ flex: counts.completed }} />
				</span>
			)}
		</div>
	);
}
