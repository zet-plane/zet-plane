import { beforeEach, describe, expect, it } from "vitest";
import { useGraphViewStore } from "./graph-view.store";

beforeEach(() => {
	useGraphViewStore.setState({ hoveredNodeId: null });
});

describe("useGraphViewStore", () => {
	it("starts with no hovered node", () => {
		expect(useGraphViewStore.getState().hoveredNodeId).toBeNull();
	});

	it("sets hoveredNodeId", () => {
		useGraphViewStore.getState().setHoveredNodeId("n1");
		expect(useGraphViewStore.getState().hoveredNodeId).toBe("n1");
	});

	it("clears hoveredNodeId on null", () => {
		useGraphViewStore.getState().setHoveredNodeId("n1");
		useGraphViewStore.getState().setHoveredNodeId(null);
		expect(useGraphViewStore.getState().hoveredNodeId).toBeNull();
	});
});
