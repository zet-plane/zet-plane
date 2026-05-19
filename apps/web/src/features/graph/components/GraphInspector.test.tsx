import { fireEvent, render, screen } from "@testing-library/react";
import type {
	KnowledgeEntryResponse,
	NodeResponse,
} from "@zet-plane/contracts";
import { describe, expect, it, vi } from "vitest";
import type { ProjectGraph } from "../domain/types";
import { GraphInspector } from "./GraphInspector";

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

const mkEntry = (
	id: string,
	nodeId: string,
	category: KnowledgeEntryResponse["category"],
): KnowledgeEntryResponse => ({
	id,
	projectId: "p",
	nodeId,
	category,
	title: id,
	body: {},
	status: "published",
	embeddingStatus: "indexed",
	createdBy: "human",
	createdAt: "2026-05-16T00:00:00.000Z",
	updatedAt: "2026-05-16T00:00:00.000Z",
});

const graph: ProjectGraph = {
	nodes: [
		mkNode("root", {
			isProjectRoot: true,
			role: "project_root",
			type: "scaffold",
		}),
		mkNode("parent", { type: "scaffold", title: "Parent" }),
		mkNode("selected", { title: "Selected node", status: "blocked" }),
		mkNode("hidden", { status: "blocked" }),
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
			id: "c-selected",
			projectId: "p",
			fromId: "parent",
			toId: "selected",
			type: "composition",
			createdBy: "human",
			createdAt: "2026-05-16T00:00:00.000Z",
		},
	],
};

describe("GraphInspector", () => {
	it("keeps raw meta collapsed until requested", async () => {
		render(
			<GraphInspector
				projectId="p"
				graph={graph}
				entries={[]}
				view="diagnose"
				selectedNodeId="selected"
				onSelectNode={vi.fn()}
			/>,
		);

		expect(screen.getByRole("button", { name: /Meta/ })).toBeInTheDocument();
		expect(screen.queryByText("Created by")).not.toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: /Meta/ }));

		expect(screen.getByText("Created by")).toBeInTheDocument();
	});

	it("uses explore-specific selected-node organization", () => {
		render(
			<GraphInspector
				projectId="p"
				graph={graph}
				entries={[mkEntry("Decision", "selected", "decision")]}
				view="explore"
				selectedNodeId="selected"
				onSelectNode={vi.fn()}
			/>,
		);

		expect(
			screen.getByRole("heading", { name: "Knowledge summary" }),
		).toBeInTheDocument();
		expect(screen.getByText("Decision")).toBeInTheDocument();
	});

	it("summarizes only the current focused context when nothing is selected", () => {
		render(
			<GraphInspector
				projectId="p"
				graph={graph}
				entries={[
					mkEntry("Visible evidence", "selected", "decision"),
					mkEntry("Hidden evidence", "hidden", "pitfall"),
				]}
				view="diagnose"
				selectedNodeId={null}
				onSelectNode={vi.fn()}
			/>,
		);

		expect(screen.getByText("Parent")).toBeInTheDocument();
		expect(screen.getByText("Blocked")).toBeInTheDocument();
		expect(screen.getAllByText("1").length).toBeGreaterThan(0);
		expect(screen.getByText("Evidence")).toBeInTheDocument();
		expect(screen.getByText("Visible evidence")).toBeInTheDocument();
		expect(screen.queryByText("Hidden evidence")).not.toBeInTheDocument();
	});

	it("marks selected peripheral satellites as external and exposes a home jump", () => {
		navigation.focusedNodeId = "parent";
		const graphWithExternal: ProjectGraph = {
			nodes: [
				...graph.nodes,
				mkNode("external", {
					title: "External node",
					type: "growth",
				}),
			],
			edges: [
				...graph.edges,
				{
					id: "c-external-home",
					projectId: "p",
					fromId: "root",
					toId: "external",
					type: "composition",
					createdBy: "human",
					createdAt: "2026-05-16T00:00:00.000Z",
				},
				{
					id: "d-selected-external",
					projectId: "p",
					fromId: "selected",
					toId: "external",
					type: "dependency",
					createdBy: "human",
					createdAt: "2026-05-16T00:00:00.000Z",
				},
			],
		};

		render(
			<GraphInspector
				projectId="p"
				graph={graphWithExternal}
				entries={[]}
				view="diagnose"
				selectedNodeId="external"
				onSelectNode={vi.fn()}
			/>,
		);

		expect(screen.getByText("External to current canvas")).toBeInTheDocument();
		expect(screen.getByText("Home canvas")).toBeInTheDocument();

		fireEvent.click(
			screen.getByRole("button", { name: "Jump to home canvas" }),
		);

		expect(navigation.diveUpTo).toHaveBeenCalledWith(null);
	});

	it("marks selected project-wide nodes outside the current focus and exposes a home jump", () => {
		navigation.focusedNodeId = "parent";
		const graphWithElsewhereNode: ProjectGraph = {
			nodes: [
				...graph.nodes,
				mkNode("other-parent", {
					title: "Other parent",
					type: "scaffold",
				}),
				mkNode("elsewhere", {
					title: "Elsewhere node",
					type: "growth",
				}),
			],
			edges: [
				...graph.edges,
				{
					id: "c-other-parent",
					projectId: "p",
					fromId: "root",
					toId: "other-parent",
					type: "composition",
					createdBy: "human",
					createdAt: "2026-05-16T00:00:00.000Z",
				},
				{
					id: "c-elsewhere",
					projectId: "p",
					fromId: "other-parent",
					toId: "elsewhere",
					type: "composition",
					createdBy: "human",
					createdAt: "2026-05-16T00:00:00.000Z",
				},
			],
		};

		render(
			<GraphInspector
				projectId="p"
				graph={graphWithElsewhereNode}
				entries={[]}
				view="explore"
				selectedNodeId="elsewhere"
				onSelectNode={vi.fn()}
			/>,
		);

		expect(screen.getByText("Outside current focus")).toBeInTheDocument();
		expect(screen.getByText("Other parent")).toBeInTheDocument();

		fireEvent.click(
			screen.getByRole("button", { name: "Jump to home canvas" }),
		);

		expect(navigation.diveUpTo).toHaveBeenCalledWith("other-parent");
	});
});
