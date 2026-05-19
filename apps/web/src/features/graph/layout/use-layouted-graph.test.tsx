import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectGraph } from "../domain/types";

const { measureNodeTextMock, layoutGraphMock } = vi.hoisted(() => ({
	measureNodeTextMock: vi.fn(),
	layoutGraphMock: vi.fn(),
}));

vi.mock("./measure-text", () => ({
	measureNodeText: measureNodeTextMock,
}));

vi.mock("./elk-layout", () => ({
	layoutGraph: layoutGraphMock,
}));

import { useLayoutedGraph } from "./use-layouted-graph";

function node(id: string, title: string) {
	return {
		id,
		projectId: "p1",
		isProjectRoot: id === "root",
		role: id === "root" ? ("project_root" as const) : ("regular" as const),
		type: "scaffold" as const,
		title,
		description: null,
		status: "active" as const,
		isCheckpoint: false,
		checkpointResolution: null,
		createdBy: "human" as const,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
	};
}

function edge(
	id: string,
	fromId: string,
	toId: string,
	type: "composition" | "dependency",
) {
	return {
		id,
		projectId: "p1",
		fromId,
		toId,
		type,
		createdBy: "human" as const,
		createdAt: "2026-01-01T00:00:00.000Z",
	};
}

describe("useLayoutedGraph", () => {
	beforeEach(() => {
		measureNodeTextMock.mockReset();
		layoutGraphMock.mockReset();
		measureNodeTextMock.mockReturnValue({ width: 80, height: 20 });
		layoutGraphMock.mockResolvedValue({
			nodes: [
				{ id: "root", position: { x: 0, y: 0 }, width: 128, height: 44 },
				{ id: "child", position: { x: 24, y: 32 }, width: 128, height: 44 },
			],
		});
	});

	it("starts layouting with undefined data", () => {
		const { result } = renderHook(() => useLayoutedGraph(undefined));

		expect(result.current.data).toBeUndefined();
		expect(result.current.isLayouting).toBe(true);
		expect(result.current.error).toBeNull();
	});

	it("returns layouted graph data asynchronously", async () => {
		const graph: ProjectGraph = {
			nodes: [node("root", "Root"), node("child", "Child")],
			edges: [
				edge("e1", "root", "child", "composition"),
				edge("e2", "root", "child", "dependency"),
			],
		};

		const { result } = renderHook(() => useLayoutedGraph(graph));

		await waitFor(() => expect(result.current.isLayouting).toBe(false));

		expect(layoutGraphMock).toHaveBeenCalledWith({
			nodes: [
				expect.objectContaining({ id: "root", parentId: null }),
				expect.objectContaining({ id: "child", parentId: null }),
			],
			edges: [
				{ id: "e1", fromId: "root", toId: "child" },
				{ id: "e2", fromId: "root", toId: "child" },
			],
		});
		expect(result.current.data).toEqual({
			nodes: [
				expect.objectContaining({
					id: "root",
					parentId: null,
					position: { x: 0, y: 0 },
				}),
				expect.objectContaining({
					id: "child",
					parentId: null,
					position: { x: 24, y: 32 },
				}),
			],
			edges: graph.edges,
		});
		expect(result.current.error).toBeNull();
	});

	it("does not rerun layout for an equivalent cloned graph", async () => {
		const graph: ProjectGraph = {
			nodes: [node("root", "Root"), node("child", "Child")],
			edges: [
				edge("e1", "root", "child", "composition"),
				edge("e2", "root", "child", "dependency"),
			],
		};
		const clonedGraph: ProjectGraph = {
			nodes: graph.nodes.map((graphNode) => ({ ...graphNode })),
			edges: graph.edges.map((graphEdge) => ({ ...graphEdge })),
		};

		const { result, rerender } = renderHook(
			({ currentGraph }) => useLayoutedGraph(currentGraph),
			{
				initialProps: { currentGraph: graph },
			},
		);

		await waitFor(() => expect(result.current.isLayouting).toBe(false));
		expect(layoutGraphMock).toHaveBeenCalledTimes(1);

		rerender({ currentGraph: clonedGraph });
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(result.current.isLayouting).toBe(false);
		expect(layoutGraphMock).toHaveBeenCalledTimes(1);
	});

	it("adds extra layout height for nodes with visible aggregation summaries", async () => {
		const graph: ProjectGraph = {
			nodes: [node("root", "Root"), node("child", "Child")],
			edges: [edge("e1", "root", "child", "composition")],
		};

		renderHook(() => useLayoutedGraph(graph));

		await waitFor(() => expect(layoutGraphMock).toHaveBeenCalledTimes(1));

		const call = layoutGraphMock.mock.calls[0]?.[0] as
			| {
					nodes: Array<{ id: string; height: number }>;
			  }
			| undefined;
		const rootNode = call?.nodes.find(
			(layoutNode: { id: string; height: number }) => layoutNode.id === "root",
		);
		const childNode = call?.nodes.find(
			(layoutNode: { id: string; height: number }) => layoutNode.id === "child",
		);

		expect(rootNode?.height).toBeGreaterThan(childNode?.height ?? 0);
	});

	it("sizes visible dive buttons from the full graph even when layout edges are dependencies only", async () => {
		layoutGraphMock.mockResolvedValueOnce({
			nodes: [
				{ id: "before", position: { x: 0, y: 0 }, width: 140, height: 32 },
				{ id: "parent", position: { x: 0, y: 48 }, width: 180, height: 35 },
			],
		});
		const visibleGraph: ProjectGraph = {
			nodes: [node("before", "Before"), node("parent", "Parent")],
			edges: [edge("d1", "before", "parent", "dependency")],
		};
		const geometryGraph: ProjectGraph = {
			nodes: [
				...visibleGraph.nodes,
				node("child-a", "Child A"),
				node("child-b", "Child B"),
			],
			edges: [
				...visibleGraph.edges,
				edge("c1", "parent", "child-a", "composition"),
				edge("c2", "parent", "child-b", "composition"),
			],
		};

		renderHook(() => useLayoutedGraph(visibleGraph, [], geometryGraph));

		await waitFor(() => expect(layoutGraphMock).toHaveBeenCalledTimes(1));

		const call = layoutGraphMock.mock.calls[0]?.[0] as
			| {
					nodes: Array<{ id: string; width: number }>;
			  }
			| undefined;
		const beforeNode = call?.nodes.find(
			(layoutNode: { id: string; width: number }) => layoutNode.id === "before",
		);
		const parentNode = call?.nodes.find(
			(layoutNode: { id: string; width: number }) => layoutNode.id === "parent",
		);

		expect(parentNode?.width).toBeGreaterThan(beforeNode?.width ?? 0);
	});
});
