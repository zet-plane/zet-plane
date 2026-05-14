import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import type { NodeResponse } from "@zet-plane/contracts";
import { Flag } from "lucide-react";
import type { AggregatedStatus } from "../domain/types";
import { containerStatusClass, nodeTypeClass } from "./status-classes";

export type ContainerCardData = {
	node: NodeResponse;
	aggregation: AggregatedStatus;
	knowledgeCount: number;
	selected: boolean;
	dimmed: boolean;
};

export type ContainerCardNode = Node<ContainerCardData>;

export function ContainerCard({ data }: NodeProps<ContainerCardNode>) {
	const { node, aggregation, selected, dimmed } = data;
	const classes = [
		"zp-container",
		nodeTypeClass(node.type),
		containerStatusClass(aggregation.worst, node.status),
	];
	if (selected) classes.push("zp-selection-ring");
	if (dimmed) classes.push("zp-edge--dim");

	const { blocked, active, completed } = aggregation.counts;
	const total = blocked + active + completed;
	const countLabel =
		total === 0
			? null
			: `${blocked} blocked / ${active} active / ${completed} done`;

	return (
		<div
			className={classes.join(" ")}
			style={{ position: "relative", width: "100%", height: "100%" }}
		>
			<Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
			<Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
			<div className="zp-container__header">
				<span style={{ display: "flex", alignItems: "center", gap: 4 }}>
					{node.isCheckpoint && <Flag size={11} />}
					<strong>{node.title}</strong>
				</span>
				{countLabel && (
					<span className="zp-container__count">{countLabel}</span>
				)}
			</div>
		</div>
	);
}
