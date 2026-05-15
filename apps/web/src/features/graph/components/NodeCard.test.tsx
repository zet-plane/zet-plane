import { ReactFlowProvider, type NodeProps, Position } from "@xyflow/react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NodeCard, type NodeCardData, type NodeCardNode } from "./NodeCard";

function renderNodeCard(data: NodeCardData) {
	const props = {
		data,
		id: data.node.id,
		type: "node",
		selected: false,
		isConnectable: false,
		positionAbsoluteX: 0,
		positionAbsoluteY: 0,
		zIndex: 0,
		dragging: false,
		selectable: true,
		deletable: false,
		draggable: false,
		sourcePosition: Position.Bottom,
		targetPosition: Position.Top,
	} satisfies NodeProps<NodeCardNode>;

	return render(
		<ReactFlowProvider>
			<NodeCard {...props} />
		</ReactFlowProvider>,
	);
}

describe("NodeCard", () => {
	it("shows aggregated descendant counts and aggregate worst status when provided", () => {
		const data = {
			node: {
				id: "node-1",
				projectId: "project-1",
				isProjectRoot: false,
				role: "regular",
				type: "scaffold",
				title: "Node 1",
				description: null,
				status: "active",
				isCheckpoint: false,
				checkpointResolution: null,
				createdBy: "human",
				createdAt: "2026-01-01T00:00:00.000Z",
				updatedAt: "2026-01-01T00:00:00.000Z",
			},
			knowledgeCount: 0,
			selected: false,
			dimmed: false,
			aggregation: {
				worst: "blocked",
				counts: {
					blocked: 1,
					active: 2,
					completed: 3,
					archived: 0,
				},
			},
		} satisfies NodeCardNode["data"];

		const { container } = renderNodeCard(data);

		expect(
			screen.getByText("1 blocked / 2 active / 3 completed"),
		).toBeInTheDocument();
		expect(container.firstChild).toHaveClass("zp-node--blocked");
	});
});
