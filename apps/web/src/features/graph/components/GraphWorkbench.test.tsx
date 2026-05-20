import { fireEvent, render, screen } from "@testing-library/react";
import type {
	KnowledgeEntryResponse,
	NodeResponse,
} from "@zet-plane/contracts";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ProjectGraph } from "../domain/types";
import { GraphWorkbench } from "./GraphWorkbench";

const navigation = vi.hoisted(() => ({
	focusedNodeId: "parent" as string | null,
	diveInto: vi.fn(),
	diveUpTo: vi.fn(),
}));

vi.mock("../hooks/use-canvas-navigation", () => ({
	useCanvasNavigation: () => ({
		focusedNodeId: navigation.focusedNodeId,
		diveInto: navigation.diveInto,
		diveUpTo: navigation.diveUpTo,
		diveToRoot: vi.fn(),
	}),
}));

vi.mock("./GraphCanvas", () => ({
	GraphCanvas: ({
		filters,
	}: {
		filters: { status: string | null; type: string | null };
	}) => (
		<div data-testid="graph-canvas" data-filters={JSON.stringify(filters)} />
	),
}));

vi.mock("./GraphInspector", () => ({
	GraphInspector: () => <aside data-testid="graph-inspector" />,
}));

vi.mock("./GraphTopBar", () => ({
	GraphTopBar: ({
		onViewChange,
	}: {
		onViewChange: (view: "diagnose" | "explore") => void;
	}) => (
		<header data-testid="graph-topbar">
			<button type="button" onClick={() => onViewChange("explore")}>
				Explore
			</button>
		</header>
	),
}));

vi.mock("./Legend", () => ({
	Legend: () => <div data-testid="graph-legend" />,
}));

vi.mock("./UpdatedAgo", () => ({
	UpdatedAgo: () => <div data-testid="updated-ago" />,
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
			title: "Project graph",
			isProjectRoot: true,
			role: "project_root",
			type: "scaffold",
		}),
		mkNode("parent", { title: "Parent", type: "scaffold" }),
		mkNode("visible", { title: "Visible child" }),
		mkNode("elsewhere", { title: "Elsewhere node" }),
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
			id: "c-visible",
			projectId: "p",
			fromId: "parent",
			toId: "visible",
			type: "composition",
			createdBy: "human",
			createdAt: "2026-05-16T00:00:00.000Z",
		},
		{
			id: "c-elsewhere",
			projectId: "p",
			fromId: "root",
			toId: "elsewhere",
			type: "composition",
			createdBy: "human",
			createdAt: "2026-05-16T00:00:00.000Z",
		},
	],
};

describe("GraphWorkbench", () => {
	it("clears diagnose filters when switching to Explore", () => {
		function Harness() {
			const [view, setView] = useState<"diagnose" | "explore">("diagnose");

			return (
				<GraphWorkbench
					projectId="p"
					graph={graph}
					entries={[] as KnowledgeEntryResponse[]}
					isLoading={false}
					error={null}
					isFetching={false}
					dataUpdatedAt={0}
					onRetry={vi.fn()}
					view={view}
					query=""
					knowledgeNodesVisible={false}
					selectedNodeId={null}
					onSelectNode={vi.fn()}
					onViewChange={setView}
					onQueryChange={vi.fn()}
					onKnowledgeNodesVisibleChange={vi.fn()}
				/>
			);
		}

		render(<Harness />);

		fireEvent.click(screen.getByRole("button", { name: "Status: blocked" }));
		expect(screen.getByTestId("graph-canvas")).toHaveAttribute(
			"data-filters",
			JSON.stringify({ status: "blocked", type: null }),
		);

		fireEvent.click(screen.getByRole("button", { name: "Explore" }));

		expect(screen.getByTestId("graph-canvas")).toHaveAttribute(
			"data-filters",
			JSON.stringify({ status: null, type: null }),
		);
	});

	it("does not auto-navigate when Explore selects a project-wide external node", () => {
		navigation.focusedNodeId = "parent";
		navigation.diveInto.mockClear();
		const onSelectNode = vi.fn();

		render(
			<GraphWorkbench
				projectId="p"
				graph={graph}
				entries={[] as KnowledgeEntryResponse[]}
				isLoading={false}
				error={null}
				isFetching={false}
				dataUpdatedAt={0}
				onRetry={vi.fn()}
				view="explore"
				query=""
				knowledgeNodesVisible={false}
				selectedNodeId="parent"
				onSelectNode={onSelectNode}
				onViewChange={vi.fn()}
				onQueryChange={vi.fn()}
				onKnowledgeNodesVisibleChange={vi.fn()}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: /Elsewhere node/ }));

		expect(onSelectNode).toHaveBeenCalledWith("elsewhere");
		expect(navigation.diveInto).not.toHaveBeenCalled();
	});
});
