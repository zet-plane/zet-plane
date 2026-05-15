import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import type { NodeResponse } from "@zet-plane/contracts";
import { Flag } from "lucide-react";
import { effectiveNodeStatus } from "../domain/effective-status";
import type { AggregatedStatus } from "../domain/types";
import { nodeStatusClass, nodeTypeClass } from "./status-classes";

export type NodeCardData = {
	node: NodeResponse;
	aggregation?: AggregatedStatus;
	knowledgeCount: number;
	selected: boolean;
	dimmed: boolean;
};

export type NodeCardNode = Node<NodeCardData>;

export function NodeCard({ data }: NodeProps<NodeCardNode>) {
	const { node, aggregation, knowledgeCount, selected, dimmed } = data;
	const displayStatus = effectiveNodeStatus(node.status, aggregation);
	const classes = [
		"zp-node",
		nodeTypeClass(node.type),
		nodeStatusClass(displayStatus),
	];
	if (selected) classes.push("zp-selection-ring");
	if (dimmed) classes.push("zp-edge--dim");

	const { blocked, active, completed } = aggregation?.counts ?? {
		blocked: 0,
		active: 0,
		completed: 0,
	};
	const aggregateTotal = blocked + active + completed;
	const aggregateLabel =
		aggregateTotal === 0
			? null
			: `${blocked} blocked / ${active} active / ${completed} completed`;

	return (
		<div
			className={classes.join(" ")}
			style={{ position: "relative", minWidth: 120 }}
		>
			<Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
			<Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
			<div className="zp-node__title">{node.title}</div>
			{aggregateLabel && (
				<div className="zp-node__summary">{aggregateLabel}</div>
			)}
			{node.isCheckpoint && (
				<span className="zp-node__glyph" role="img" aria-label="checkpoint">
					<Flag size={11} />
				</span>
			)}
			{knowledgeCount > 0 && (
				<span
					className="zp-node__badge"
					role="img"
					aria-label={`${knowledgeCount} knowledge entries`}
				>
					K{knowledgeCount}
				</span>
			)}
		</div>
	);
}
