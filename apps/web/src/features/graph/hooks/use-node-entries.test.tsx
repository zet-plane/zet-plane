import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { listEntriesEndpoint } from "@zet-plane/contracts";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useNodeEntries } from "./use-node-entries";

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

describe("useNodeEntries", () => {
	beforeEach(() => {
		apiCallMock.mockReset();
	});

	it("does not run the query when nodeId is missing", () => {
		const { result } = renderHook(() => useNodeEntries("p1", null), {
			wrapper: createWrapper(),
		});

		expect(result.current.fetchStatus).toBe("idle");
		expect(apiCallMock).not.toHaveBeenCalled();
	});

	it("calls listEntries with project and node ids when enabled", async () => {
		const entries = [
			{
				id: "entry-1",
				projectId: "p1",
				nodeId: "n1",
				category: "context",
				title: "Context",
				body: { value: "Body" },
				status: "draft",
				embeddingStatus: "unindexed",
				createdBy: "human",
				createdAt: "2026-01-01T00:00:00.000Z",
				updatedAt: "2026-01-01T00:00:00.000Z",
			},
		];

		apiCallMock.mockImplementation(async () => entries as never);

		const { result } = renderHook(() => useNodeEntries("p1", "n1"), {
			wrapper: createWrapper(),
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(apiCallMock).toHaveBeenCalledWith(listEntriesEndpoint, {
			params: { id: "p1" },
			query: { nodeId: "n1" },
		});
	});
});
