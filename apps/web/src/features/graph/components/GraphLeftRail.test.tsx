import { fireEvent, render, screen } from "@testing-library/react";
import type { NodeResponse } from "@zet-plane/contracts";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { GraphWorkbenchFilters } from "../domain/graph-workbench";
import type { ProjectGraph } from "../domain/types";
import { GraphLeftRail } from "./GraphLeftRail";

vi.mock("../hooks/use-canvas-navigation", () => ({
	useCanvasNavigation: () => ({
		focusedNodeId: "parent",
		diveInto: vi.fn(),
		diveUpTo: vi.fn(),
		diveToRoot: vi.fn(),
	}),
}));

const mkNode = (
	id: string,
	overrides: Partial<NodeResponse> = {},
): NodeResponse => ({
	id,
	projectId: "p",
	isProjectRoot: false,
	role: "regular",
	type: "growth",
	title: id,
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
		mkNode("root", {
			isProjectRoot: true,
			role: "project_root",
			type: "scaffold",
		}),
		mkNode("parent", { type: "scaffold" }),
		mkNode("blocked-child", { title: "Blocked child", status: "blocked" }),
		mkNode("checkpoint-child", {
			title: "Checkpoint child",
			isCheckpoint: true,
		}),
		mkNode("outside-blocked", { title: "Outside blocked", status: "blocked" }),
	],
	edges: [
		{
			id: "c-parent",
			projectId: "p",
			fromId: "root",
			toId: "parent",
			type: "composition",
			createdBy: "human",
			createdAt: "2026-05-16T00:00:00.000Z",
		},
		{
			id: "c-blocked",
			projectId: "p",
			fromId: "parent",
			toId: "blocked-child",
			type: "composition",
			createdBy: "human",
			createdAt: "2026-05-16T00:00:00.000Z",
		},
		{
			id: "c-checkpoint",
			projectId: "p",
			fromId: "parent",
			toId: "checkpoint-child",
			type: "composition",
			createdBy: "human",
			createdAt: "2026-05-16T00:00:00.000Z",
		},
	],
};

describe("GraphLeftRail", () => {
	it("groups diagnose attention items from the current focused context only", () => {
		render(
			<GraphLeftRail
				graph={graph}
				view="diagnose"
				query=""
				selectedNodeId={null}
				onQueryChange={vi.fn()}
				onSelectNode={vi.fn()}
			/>,
		);

		expect(screen.getByText("Blocked")).toBeInTheDocument();
		expect(screen.getByText("Checkpoints")).toBeInTheDocument();
		expect(screen.getByText("Blocked child")).toBeInTheDocument();
		expect(screen.getByText("Checkpoint child")).toBeInTheDocument();
		expect(screen.queryByText("Outside blocked")).not.toBeInTheDocument();
	});

	it("filters diagnose attention items by selected status chip", () => {
		function Harness() {
			const [filters, setFilters] = useState<GraphWorkbenchFilters>({
				status: null,
				type: null,
			});
			return (
				<GraphLeftRail
					graph={graph}
					view="diagnose"
					query=""
					selectedNodeId={null}
					onQueryChange={vi.fn()}
					onSelectNode={vi.fn()}
					filters={filters}
					onFiltersChange={setFilters}
				/>
			);
		}

		render(<Harness />);

		fireEvent.click(screen.getByRole("button", { name: "Status: blocked" }));

		expect(screen.getByText("Blocked child")).toBeInTheDocument();
		expect(screen.queryByText("Checkpoint child")).not.toBeInTheDocument();
	});
});
