import type { NodeResponse } from '@zet-plane/contracts';
import { Flag } from 'lucide-react';
import { effectiveNodeStatus } from '../domain/effective-status';
import type { AggregatedStatus } from '../domain/types';

type Props = {
	node: NodeResponse;
	aggregation: AggregatedStatus | undefined;
};

export function HeroToken({ node, aggregation }: Props) {
	if (node.isProjectRoot) return <ProjectHero node={node} />;
	return <ScaffoldHero node={node} aggregation={aggregation} />;
}

function ProjectHero({ node }: { node: NodeResponse }) {
	return (
		<div className="zp-hero zp-hero--project">
			<div className="zp-hero__eyebrow">Project</div>
			<div className="zp-hero__title">{node.title}</div>
			{node.description && (
				<div className="zp-hero__desc">{node.description}</div>
			)}
		</div>
	);
}

function ScaffoldHero({
	node,
	aggregation,
}: { node: NodeResponse; aggregation: AggregatedStatus | undefined }) {
	const displayStatus = effectiveNodeStatus(node.status, aggregation);
	const classes = ['zp-hero', 'zp-hero--scaffold', `zp-pill--${displayStatus}`];
	if (node.isCheckpoint) classes.push('zp-pill--checkpoint');

	return (
		<div className={classes.join(' ')}>
			{node.isCheckpoint && (
				<span className="zp-pill__flag" aria-label="checkpoint">
					<Flag size={11} />
				</span>
			)}
			<span className="zp-hero__title">{node.title}</span>
			{node.description && (
				<div className="zp-hero__desc">{node.description}</div>
			)}
		</div>
	);
}
