import { describe, it, expect, beforeEach } from "vitest";
import { useGraphViewStore } from "./graph-view.store";

beforeEach(() => {
  useGraphViewStore.setState({
    nodes: [],
    edges: [],
    selectedNodeIds: new Set(),
    viewport: { x: 0, y: 0, zoom: 1 },
  });
});

describe("useGraphViewStore", () => {
  it("starts with empty nodes and edges", () => {
    const { nodes, edges } = useGraphViewStore.getState();
    expect(nodes).toHaveLength(0);
    expect(edges).toHaveLength(0);
  });

  it("sets nodes", () => {
    const node = { id: "1", position: { x: 0, y: 0 }, data: { label: "A" } };
    useGraphViewStore.getState().setNodes([node]);
    expect(useGraphViewStore.getState().nodes).toHaveLength(1);
  });

  it("selects a node by id", () => {
    useGraphViewStore.getState().selectNode("abc");
    expect(useGraphViewStore.getState().selectedNodeIds.has("abc")).toBe(true);
  });

  it("clears selection", () => {
    useGraphViewStore.getState().selectNode("abc");
    useGraphViewStore.getState().clearSelection();
    expect(useGraphViewStore.getState().selectedNodeIds.size).toBe(0);
  });

  it("updates viewport", () => {
    useGraphViewStore.getState().setViewport({ x: 10, y: 20, zoom: 1.5 });
    expect(useGraphViewStore.getState().viewport).toEqual({ x: 10, y: 20, zoom: 1.5 });
  });
});
