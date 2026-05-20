import {
	BaseEdge,
	type Edge,
	type EdgeProps,
	getBezierPath,
} from "@xyflow/react";
import type { NodeResponse } from "@zet-plane/contracts";
import { edgeStateClass } from "./status-classes";

export type DependencyEdgeData = {
	targetStatus: NodeResponse["status"];
	selected: boolean;
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
	const [path] = getBezierPath({
		sourceX,
		sourceY,
		targetX,
		targetY,
		sourcePosition,
		targetPosition,
	});
	const classes = [
		"zp-edge",
		edgeStateClass({
			selected: data?.selected ?? false,
			dimmed: data?.dimmed ?? false,
			blocked: data?.targetStatus === "blocked",
		}),
	];
	const isKnowledge = data?.variant === "knowledge";
	const isPeripheral = data?.variant === "peripheral";
	const style = isKnowledge
		? { strokeDasharray: "4 4", strokeWidth: 1.25 }
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
