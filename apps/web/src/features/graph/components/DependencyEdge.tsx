import {
	BaseEdge,
	type Edge,
	type EdgeProps,
	getBezierPath,
	getSmoothStepPath,
} from "@xyflow/react";
import type { NodeResponse } from "@zet-plane/contracts";
import { edgeStatusClass } from "./status-classes";

export type DependencyEdgeData = {
	targetStatus: NodeResponse["status"];
	dimmed: boolean;
	variant?: "flow" | "knowledge" | "peripheral";
};

export type DependencyEdgeType = Edge<DependencyEdgeData>;

export function DependencyEdge(props: EdgeProps<DependencyEdgeType>) {
	const {
		sourceX,
		sourceY,
		targetX,
		targetY,
		sourcePosition,
		targetPosition,
		data,
		markerEnd,
	} = props;
	const isPeripheral = data?.variant === "peripheral";
	const isKnowledge = data?.variant === "knowledge";
	const [path] = isPeripheral
		? getSmoothStepPath({
				sourceX,
				sourceY,
				targetX,
				targetY,
				sourcePosition,
				targetPosition,
				borderRadius: 12,
			})
		: getBezierPath({
				sourceX,
				sourceY,
				targetX,
				targetY,
				sourcePosition,
				targetPosition,
			});
	const classes = ["zp-edge", edgeStatusClass(data?.targetStatus ?? "active")];
	if (data?.dimmed) classes.push("zp-edge--dim");
	const style = isKnowledge
		? { stroke: "var(--zp-edge-knowledge, #a67bd8)", strokeDasharray: "4 4", strokeWidth: 1.25 }
		: isPeripheral
			? { strokeDasharray: "3 4", strokeWidth: 1.25 }
			: undefined;
	return (
		<BaseEdge
			id={props.id}
			path={path}
			className={classes.join(" ")}
			markerEnd={markerEnd}
			style={style}
		/>
	);
}
