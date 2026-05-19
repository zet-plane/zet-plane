import { render, screen } from "@testing-library/react";
import type { NodeResponse } from "@zet-plane/contracts";
import { describe, expect, it, vi } from "vitest";
import type { ProjectGraph } from "../domain/types";
import { GraphTopBar } from "./GraphTopBar";

vi.mock("../hooks/use-canvas-navigation", () => ({
	useCanvasNavigation: () => ({
		focusedNodeId: "leaf",
		diveUpTo: vi.fn(),
	}),
}));

const mkNode = (
	id: string,
	title: string,
	overrides: Partial<NodeResponse> = {},
): NodeResponse => ({
	id,
	projectId: "p",
	isProjectRoot: false,
	role: "regular",
	type: "scaffold",
	title,
	description: null,
	status: "active",
	isCheckpoint: false,
	checkpointResolution: null,
	createdBy: "human",
	createdAt: "2026-05-16T00:00:00.000Z",
	updatedAt: "2026-05-16T00:00:00.000Z",
	...overrides,
});

const graph: ProjectGraph = {
	nodes: [
		mkNode("root", "Root", { isProjectRoot: true, role: "project_root" }),
		mkNode("a", "Alpha"),
		mkNode("b", "Beta"),
		mkNode("leaf", "Leaf"),
	],
	edges: [
		{
			id: "e-root-a",
			projectId: "p",
			fromId: "root",
			toId: "a",
			type: "composition",
			createdBy: "human",
			createdAt: "2026-05-16T00:00:00.000Z",
		},
		{
			id: "e-a-b",
			projectId: "p",
			fromId: "a",
			toId: "b",
			type: "composition",
			createdBy: "human",
			createdAt: "2026-05-16T00:00:00.000Z",
		},
		{
			id: "e-b-leaf",
			projectId: "p",
			fromId: "b",
			toId: "leaf",
			type: "composition",
			createdBy: "human",
			createdAt: "2026-05-16T00:00:00.000Z",
		},
	],
};

describe("GraphTopBar", () => {
	it("collapses the middle of deep breadcrumbs", () => {
		render(
			<GraphTopBar
				graph={graph}
				view="diagnose"
				knowledgeNodesVisible={false}
				dataUpdatedAt={0}
				isFetching={false}
				onRefresh={vi.fn()}
				onViewChange={vi.fn()}
				onKnowledgeNodesVisibleChange={vi.fn()}
			/>,
		);

		expect(screen.getByRole("button", { name: "Root" })).toBeInTheDocument();
		expect(screen.getByText("...")).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "Alpha" }),
		).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Beta" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Leaf" })).toBeInTheDocument();
	});
});
