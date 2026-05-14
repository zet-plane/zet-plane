import {
	BaseEdge,
	type Edge,
	type EdgeProps,
	getBezierPath,
} from "@xyflow/react";
import type { NodeResponse } from "@zet-plane/contracts";
import { edgeStatusClass } from "./status-classes";

export type DependencyEdgeData = {
	targetStatus: NodeResponse["status"];
	dimmed: boolean;
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
	const classes = ["zp-edge", edgeStatusClass(data?.targetStatus ?? "active")];
	if (data?.dimmed) classes.push("zp-edge--dim");
	return (
		<BaseEdge
			id={props.id}
			path={path}
			className={classes.join(" ")}
			markerEnd={markerEnd}
		/>
	);
}
