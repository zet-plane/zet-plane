import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useProjectGraph } from "./use-project-graph";

vi.mock("@/lib/api-client", () => ({
	apiCall: vi.fn(),
}));

import { apiCall } from "@/lib/api-client";

const apiCallMock = vi.mocked(apiCall);

function createWrapper() {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				retry: false,
			},
		},
	});

	return function Wrapper({ children }: { children: React.ReactNode }) {
		return React.createElement(
			QueryClientProvider,
			{ client: queryClient },
			children,
		);
	};
}

describe("useProjectGraph", () => {
	beforeEach(() => {
		apiCallMock.mockReset();
	});

	it("returns assembled graph data from nodes and edges queries", async () => {
		const nodes = [
			{
				id: "n1",
				projectId: "p1",
				isProjectRoot: true,
				role: "regular",
				type: "scaffold",
				title: "Root",
				description: null,
				status: "active",
				isCheckpoint: false,
				checkpointResolution: null,
				createdBy: "human",
				createdAt: "2026-01-01T00:00:00.000Z",
				updatedAt: "2026-01-01T00:00:00.000Z",
			},
		];
		const edges = [
			{
				id: "e1",
				projectId: "p1",
				fromId: "n1",
				toId: "n2",
				type: "composition",
				createdBy: "human",
				createdAt: "2026-01-01T00:00:00.000Z",
			},
		];

		apiCallMock
			.mockImplementationOnce(async () => nodes as never)
			.mockImplementationOnce(async () => edges as never);

		const { result } = renderHook(() => useProjectGraph("p1"), {
			wrapper: createWrapper(),
		});

		await waitFor(() => expect(result.current.isLoading).toBe(false));

		expect(result.current.data?.nodes.map((node) => node.id)).toEqual(["n1"]);
		expect(result.current.data?.edges.map((edge) => edge.id)).toEqual(["e1"]);
		expect(result.current.error).toBeNull();
	});

	it("surfaces the node query error", async () => {
		const error = new Error("nodes failed");
		apiCallMock
			.mockRejectedValueOnce(error)
			.mockImplementationOnce(async () => [] as never);

		const { result } = renderHook(() => useProjectGraph("p1"), {
			wrapper: createWrapper(),
		});

		await waitFor(() => expect(result.current.error).toBe(error));

		expect(result.current.data).toBeUndefined();
	});
});
