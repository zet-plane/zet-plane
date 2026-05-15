import { Position, type EdgeProps, getBezierPath } from "@xyflow/react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CompositionEdge, type CompositionEdgeType } from "./CompositionEdge";

describe("CompositionEdge", () => {
	it("renders a path distinct from the default bezier for identical endpoints", () => {
		const edgeProps = {
			id: "edge-1",
			sourceX: 100,
			sourceY: 80,
			targetX: 260,
			targetY: 220,
			sourcePosition: Position.Bottom,
			targetPosition: Position.Top,
			data: { dimmed: false },
		} as EdgeProps<CompositionEdgeType>;

		const [defaultPath] = getBezierPath({
			sourceX: edgeProps.sourceX,
			sourceY: edgeProps.sourceY,
			targetX: edgeProps.targetX,
			targetY: edgeProps.targetY,
			sourcePosition: edgeProps.sourcePosition,
			targetPosition: edgeProps.targetPosition,
		});

		const { container } = render(
			<svg>
				<CompositionEdge {...edgeProps} />
			</svg>,
		);

		const path = container.querySelector("path");
		expect(path).not.toBeNull();
		expect(path?.getAttribute("d")).not.toBe(defaultPath);
	});
});
