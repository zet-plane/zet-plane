import {
	BaseEdge,
	type Edge,
	type EdgeProps,
	getBezierPath,
} from "@xyflow/react";

export type CompositionEdgeData = {
	dimmed: boolean;
};

export type CompositionEdgeType = Edge<CompositionEdgeData>;

export function CompositionEdge(props: EdgeProps<CompositionEdgeType>) {
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
	const classes = ["zp-edge", "zp-edge--composition"];
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
