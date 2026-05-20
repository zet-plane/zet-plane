import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import type { NodeResponse } from "@zet-plane/contracts";
import { ArrowUpRight } from "lucide-react";
import { useTranslation } from "react-i18next";

export type PeripheralPlacement = "top" | "right" | "bottom" | "left";

export type PeripheralStubData = {
	node: NodeResponse;
	placement: PeripheralPlacement;
	direction: "incoming" | "outgoing";
	selected: boolean;
	dimmed?: boolean;
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
	const { t } = useTranslation("graph");
	const { node, placement, direction, selected, dimmed, jumpTargetId, onJump } =
		data;
	const classes = [
		"zp-pill",
		"zp-pill--peripheral",
		`zp-pill--${node.type}`,
		`zp-pill--${node.status}`,
	];
	if (selected) classes.push("zp-pill--selected");
	if (dimmed) classes.push("zp-pill--dimmed");
	const handleType = direction === "incoming" ? "source" : "target";
	return (
		// biome-ignore lint/a11y/useSemanticElements: React Flow node surfaces are divs because nested buttons and handles live inside the node.
		<div
			className={classes.join(" ")}
			role="button"
			tabIndex={0}
			aria-label={t("peripheral.open", { title: node.title })}
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
				aria-label={t("peripheral.jumpTo", { title: node.title })}
				title={t("peripheral.jumpIn")}
			>
				<ArrowUpRight size={11} aria-hidden />
			</button>
		</div>
	);
}
