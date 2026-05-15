import {
	BaseEdge,
	type Edge,
	type EdgeProps,
	getBezierPath,
} from "@xyflow/react";

const COMPOSITION_EDGE_OFFSET = 10;

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
		// Offset composition slightly so it stays visible beside dependencies.
		sourceX: sourceX + COMPOSITION_EDGE_OFFSET,
		sourceY,
		targetX: targetX + COMPOSITION_EDGE_OFFSET,
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
