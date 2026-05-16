import { Handle, type Node, type NodeProps, Position } from '@xyflow/react';
import type { NodeResponse } from '@zet-plane/contracts';
import { Flag } from 'lucide-react';
import { effectiveNodeStatus } from '../domain/effective-status';
import type { AggregatedStatus } from '../domain/types';

export type PillData = {
	node: NodeResponse;
	aggregation: AggregatedStatus | undefined;
	knowledgeCount: number;
	childCount: number;
	selected: boolean;
	dimmed: boolean;
};

export type PillNode = Node<PillData>;

export function Pill({ data }: NodeProps<PillNode>) {
	const { node, aggregation, knowledgeCount, childCount, selected, dimmed } = data;
	const displayStatus = effectiveNodeStatus(node.status, aggregation);

	const classes = ['zp-pill', `zp-pill--${node.type}`, `zp-pill--${displayStatus}`];
	if (node.type === 'scaffold' && node.isCheckpoint) classes.push('zp-pill--checkpoint');
	if (selected) classes.push('zp-pill--selected');
	if (dimmed) classes.push('zp-pill--dimmed');

	const showAggBar = childCount > 0 && aggregation !== undefined;
	const counts = aggregation?.counts ?? { active: 0, blocked: 0, completed: 0, archived: 0 };

	return (
		<div className={classes.join(' ')}>
			<Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
			<Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
			{node.type === 'scaffold' && node.isCheckpoint && (
				<span className="zp-pill__flag" aria-label="checkpoint">
					<Flag size={9} />
				</span>
			)}
			<span className="zp-pill__title">{node.title}</span>
			{knowledgeCount > 0 && (
				<span className="zp-pill__chip" aria-label={`${knowledgeCount} knowledge entries`}>
					K{knowledgeCount}
				</span>
			)}
			{childCount > 0 && (
				<span className="zp-pill__dive" aria-label={`${childCount} children, click to dive in`}>
					↳{childCount}
				</span>
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
