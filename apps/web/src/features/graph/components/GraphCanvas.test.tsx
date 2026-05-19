import { fireEvent, render, screen } from "@testing-library/react";
import type {
	KnowledgeEntryResponse,
	NodeResponse,
} from "@zet-plane/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectGraph } from "../domain/types";
import { GraphCanvas } from "./GraphCanvas";

const navigation = vi.hoisted(() => ({
	focusedNodeId: null as string | null,
	diveInto: vi.fn(),
	diveUpTo: vi.fn(),
}));

vi.mock("@xyflow/react", () => ({
	Background: () => null,
	Controls: () => null,
	Handle: () => null,
	MarkerType: { ArrowClosed: "arrowclosed" },
	Position: { Top: "top", Right: "right", Bottom: "bottom", Left: "left" },
	ReactFlowProvider: ({ children }: { children: React.ReactNode }) => (
		<>{children}</>
	),
	ReactFlow: ({
		nodes,
		edges,
	}: {
		nodes: Array<{ id: string; data?: { dimmed?: boolean } }>;
		edges: Array<{ id: string; data?: { variant?: string } }>;
	}) => (
		<div
			data-testid="react-flow"
			data-node-ids={nodes.map((node) => node.id).join(",")}
			data-dimmed-node-ids={nodes
				.filter((node) => node.data?.dimmed)
				.map((node) => node.id)
				.join(",")}
			data-edge-variants={edges
				.map((edge) => `${edge.id}:${edge.data?.variant ?? "none"}`)
				.join(",")}
		/>
	),
}));

vi.mock("../hooks/use-canvas-navigation", () => ({
	useCanvasNavigation: () => ({
		focusedNodeId: navigation.focusedNodeId,
		diveInto: navigation.diveInto,
		diveUpTo: navigation.diveUpTo,
		diveToRoot: vi.fn(),
	}),
}));

vi.mock("../layout/use-layouted-graph", () => ({
	useLayoutedGraph: (graph: ProjectGraph | undefined) => ({
		data: graph
			? {
					nodes: graph.nodes.map((node, index) => ({
						...node,
						width: 120,
						height: 36,
						position: { x: index * 160, y: 0 },
						parentId: null,
					})),
					edges: graph.edges,
				}
			: undefined,
		isLayouting: false,
		error: null,
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

const mkEntry = (id: string, nodeId: string): KnowledgeEntryResponse => ({
	id,
	projectId: "p",
	nodeId,
	category: "decision",
	title: id,
	body: {},
	status: "published",
	embeddingStatus: "indexed",
	createdBy: "human",
	createdAt: "2026-05-16T00:00:00.000Z",
	updatedAt: "2026-05-16T00:00:00.000Z",
});

describe("GraphCanvas knowledge nodes", () => {
	beforeEach(() => {
		navigation.focusedNodeId = null;
		navigation.diveInto.mockClear();
		navigation.diveUpTo.mockClear();
	});

	it("renders explicit knowledge nodes only when the URL-backed toggle is enabled", () => {
		const graph: ProjectGraph = {
			nodes: [
				mkNode("root", {
					isProjectRoot: true,
					role: "project_root",
					type: "scaffold",
				}),
				mkNode("child"),
			],
			edges: [
				{
					id: "c-child",
					projectId: "p",
					fromId: "root",
					toId: "child",
					type: "composition",
					createdBy: "human",
					createdAt: "2026-05-16T00:00:00.000Z",
				},
			],
		};
		const entries = [mkEntry("k1", "child")];
		const props = {
			graph,
			entries,
			isLoading: false,
			error: null,
			selectedNodeId: null,
			onSelectNode: vi.fn(),
		};

		const { rerender } = render(
			<GraphCanvas {...props} knowledgeNodesVisible={false} />,
		);

		expect(screen.getByTestId("react-flow")).not.toHaveAttribute(
			"data-node-ids",
			expect.stringContaining("knowledge:k1"),
		);

		rerender(<GraphCanvas {...props} knowledgeNodesVisible />);

		expect(screen.getByTestId("react-flow")).toHaveAttribute(
			"data-node-ids",
			expect.stringContaining("knowledge:k1"),
		);
		expect(screen.getByTestId("react-flow")).toHaveAttribute(
			"data-edge-variants",
			expect.stringContaining("knowledge:k1:knowledge"),
		);
	});

	it("dims nodes that do not match an active diagnose filter", () => {
		const graph: ProjectGraph = {
			nodes: [
				mkNode("root", {
					isProjectRoot: true,
					role: "project_root",
					type: "scaffold",
				}),
				mkNode("blocked", { status: "blocked" }),
				mkNode("active", { status: "active" }),
			],
			edges: [
				{
					id: "c-blocked",
					projectId: "p",
					fromId: "root",
					toId: "blocked",
					type: "composition",
					createdBy: "human",
					createdAt: "2026-05-16T00:00:00.000Z",
				},
				{
					id: "c-active",
					projectId: "p",
					fromId: "root",
					toId: "active",
					type: "composition",
					createdBy: "human",
					createdAt: "2026-05-16T00:00:00.000Z",
				},
			],
		};

		render(
			<GraphCanvas
				graph={graph}
				entries={[]}
				isLoading={false}
				error={null}
				selectedNodeId={null}
				onSelectNode={vi.fn()}
				filters={{ status: "blocked", type: null }}
			/>,
		);

		expect(screen.getByTestId("react-flow")).toHaveAttribute(
			"data-dimmed-node-ids",
			"active",
		);
	});

	it("dims nodes that are not one-hop dependency neighbors of the selected node", () => {
		const graph: ProjectGraph = {
			nodes: [
				mkNode("root", {
					isProjectRoot: true,
					role: "project_root",
					type: "scaffold",
				}),
				mkNode("a"),
				mkNode("b"),
				mkNode("c"),
			],
			edges: [
				{
					id: "c-a",
					projectId: "p",
					fromId: "root",
					toId: "a",
					type: "composition",
					createdBy: "human",
					createdAt: "2026-05-16T00:00:00.000Z",
				},
				{
					id: "c-b",
					projectId: "p",
					fromId: "root",
					toId: "b",
					type: "composition",
					createdBy: "human",
					createdAt: "2026-05-16T00:00:00.000Z",
				},
				{
					id: "c-c",
					projectId: "p",
					fromId: "root",
					toId: "c",
					type: "composition",
					createdBy: "human",
					createdAt: "2026-05-16T00:00:00.000Z",
				},
				{
					id: "d-ab",
					projectId: "p",
					fromId: "a",
					toId: "b",
					type: "dependency",
					createdBy: "human",
					createdAt: "2026-05-16T00:00:00.000Z",
				},
			],
		};

		render(
			<GraphCanvas
				graph={graph}
				entries={[]}
				isLoading={false}
				error={null}
				selectedNodeId="a"
				onSelectNode={vi.fn()}
			/>,
		);

		expect(screen.getByTestId("react-flow")).toHaveAttribute(
			"data-dimmed-node-ids",
			"c",
		);
	});

	it("shows a leaf-focused empty state with an explicit parent return", () => {
		navigation.focusedNodeId = "leaf";
		const graph: ProjectGraph = {
			nodes: [
				mkNode("root", {
					isProjectRoot: true,
					role: "project_root",
					type: "scaffold",
				}),
				mkNode("parent", { type: "scaffold" }),
				mkNode("leaf", { title: "Leaf node" }),
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
					id: "c-leaf",
					projectId: "p",
					fromId: "parent",
					toId: "leaf",
					type: "composition",
					createdBy: "human",
					createdAt: "2026-05-16T00:00:00.000Z",
				},
			],
		};

		render(
			<GraphCanvas
				graph={graph}
				entries={[]}
				isLoading={false}
				error={null}
				selectedNodeId={null}
				onSelectNode={vi.fn()}
			/>,
		);

		expect(
			screen.getByText("Leaf node has no child nodes."),
		).toBeInTheDocument();
		fireEvent.click(
			screen.getByRole("button", { name: "Return to parent canvas" }),
		);
		expect(navigation.diveUpTo).toHaveBeenCalledWith("parent");
	});

	it("keeps external selections out of the canvas and offers an explicit home jump", () => {
		navigation.focusedNodeId = "parent";
		const graph: ProjectGraph = {
			nodes: [
				mkNode("root", {
					isProjectRoot: true,
					role: "project_root",
					type: "scaffold",
				}),
				mkNode("parent", { type: "scaffold" }),
				mkNode("visible", { title: "Visible node" }),
				mkNode("other-parent", { type: "scaffold", title: "Other parent" }),
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
		const onSelectNode = vi.fn();

		render(
			<GraphCanvas
				graph={graph}
				entries={[]}
				isLoading={false}
				error={null}
				selectedNodeId="elsewhere"
				onSelectNode={onSelectNode}
			/>,
		);

		expect(screen.getByTestId("react-flow")).not.toHaveAttribute(
			"data-node-ids",
			expect.stringContaining("elsewhere"),
		);
		expect(
			screen.getByText('Selected outside this canvas: "Elsewhere node"'),
		).toBeInTheDocument();
		expect(screen.getByText("Lives under: Other parent")).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "Show on canvas" }));
		expect(navigation.diveUpTo).toHaveBeenCalledWith("other-parent");

		fireEvent.click(screen.getByRole("button", { name: "Clear" }));
		expect(onSelectNode).toHaveBeenCalledWith(null);
	});
});
