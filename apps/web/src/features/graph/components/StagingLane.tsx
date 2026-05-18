import type { Node, NodeProps } from '@xyflow/react';
import type { NodeResponse } from '@zet-plane/contracts';

export type StagingLaneData = {
	nodes: NodeResponse[];
	selectedNodeId: string | null;
	onSelect: (id: string) => void;
};

export type StagingLaneNode = Node<StagingLaneData>;

export function StagingLane({ data }: NodeProps<StagingLaneNode>) {
	return (
		<section className="zp-staging-lane" aria-label="Staging lane">
			<header className="zp-staging-lane__header">
				<span>Staging</span>
				<span>{data.nodes.length}</span>
			</header>
			<div className="zp-staging-lane__items">
				{data.nodes.length === 0 ? (
					<div className="zp-staging-lane__empty">No unanchored nodes</div>
				) : (
					data.nodes.map((node) => (
						<button
							key={node.id}
							type="button"
							className={
								data.selectedNodeId === node.id
									? 'zp-staging-lane__item zp-staging-lane__item--selected'
									: 'zp-staging-lane__item'
							}
							onClick={(event) => {
								event.stopPropagation();
								data.onSelect(node.id);
							}}
						>
							<span className="zp-staging-lane__marker">unanchored</span>
							<span>{node.title}</span>
						</button>
					))
				)}
			</div>
		</section>
	);
}
