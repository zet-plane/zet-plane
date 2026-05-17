import type { NodeResponse } from '@zet-plane/contracts';

type Props = {
	nodes: NodeResponse[];
	onSelect: (id: string) => void;
};

export function StagingPanel({ nodes, onSelect }: Props) {
	const stagingNodes = nodes.filter((n) => n.role === 'staging_root' || n.type === 'staging');

	return (
		<aside className="zp-staging" aria-label="Staging region">
			<div className="zp-staging__header">
				<span className="zp-staging__title">Staging</span>
				<span className="zp-staging__count">{stagingNodes.length}</span>
			</div>
			<div className="zp-staging__list">
				{stagingNodes.length === 0 ? (
					<div className="zp-staging__empty">No unanchored nodes</div>
				) : (
					stagingNodes.map((n) => (
						<button
							key={n.id}
							type="button"
							className={`zp-pill zp-pill--growth zp-pill--${n.status} zp-pill--staging`}
							onClick={() => onSelect(n.id)}
						>
							<span className="zp-pill__title">{n.title}</span>
						</button>
					))
				)}
			</div>
		</aside>
	);
}
