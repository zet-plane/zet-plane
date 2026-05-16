import type { NodeResponse } from '@zet-plane/contracts';
import { ArrowUpRight } from 'lucide-react';

type Props = {
	node: NodeResponse;
	onJump: (id: string) => void;
};

export function PeripheralStub({ node, onJump }: Props) {
	const classes = [
		'zp-pill',
		'zp-pill--peripheral',
		`zp-pill--${node.type}`,
		`zp-pill--${node.status}`,
	];
	return (
		<button
			type="button"
			className={classes.join(' ')}
			onClick={() => onJump(node.id)}
			aria-label={`Open ${node.title}`}
		>
			<span className="zp-pill__title">{node.title}</span>
			<ArrowUpRight size={11} className="zp-pill__jump" aria-hidden />
		</button>
	);
}
