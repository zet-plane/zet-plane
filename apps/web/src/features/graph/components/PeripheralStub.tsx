import { Handle, type Node, type NodeProps, Position } from '@xyflow/react';
import type { NodeResponse } from '@zet-plane/contracts';
import { ArrowUpRight } from 'lucide-react';

export type PeripheralPlacement = 'top' | 'right' | 'bottom' | 'left';

export type PeripheralStubData = {
	node: NodeResponse;
	placement: PeripheralPlacement;
	direction: 'incoming' | 'outgoing';
	selected: boolean;
	jumpTargetId: string;
	onJump?: (id: string) => void;
};

export type PeripheralStubNode = Node<PeripheralStubData>;

// Handle goes on the side facing the sub-graph interior.
const HANDLE_POSITION: Record<PeripheralPlacement, Position> = {
	left: Position.Right,
	right: Position.Left,
	top: Position.Bottom,
	bottom: Position.Top,
};

export function PeripheralStub({ data }: NodeProps<PeripheralStubNode>) {
	const { node, placement, direction, selected, jumpTargetId, onJump } = data;
	const classes = [
		'zp-pill',
		'zp-pill--peripheral',
		`zp-pill--${node.type}`,
		`zp-pill--${node.status}`,
	];
	if (selected) classes.push('zp-pill--selected');
	const handleType = direction === 'incoming' ? 'source' : 'target';
	return (
		<div
			className={classes.join(' ')}
			role="button"
			tabIndex={0}
			aria-label={`Open ${node.title}`}
			aria-pressed={selected}
		>
			<Handle
				type={handleType}
				position={HANDLE_POSITION[placement]}
				id="main"
				style={{ opacity: 0 }}
			/>
			<span className="zp-pill__title">{node.title}</span>
			<button
				type="button"
				className="zp-pill__jump-btn"
				onClick={(e) => {
					e.stopPropagation();
					onJump?.(jumpTargetId);
				}}
				aria-label={`Jump to ${node.title}`}
				title="Jump in"
			>
				<ArrowUpRight size={11} aria-hidden />
			</button>
		</div>
	);
}
