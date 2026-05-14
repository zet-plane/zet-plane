import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useProjectsList } from "./use-projects-list";

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
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe("useProjectsList", () => {
  beforeEach(() => {
    apiCallMock.mockReset();
  });

  it("returns project ids from the projects query", async () => {
    const projects = [
      {
        id: "p1",
        name: "Alpha",
        description: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "p2",
        name: "Beta",
        description: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    apiCallMock.mockImplementation(async () => projects as never);

    const { result } = renderHook(() => useProjectsList(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.map((project) => project.id)).toEqual(["p1", "p2"]);
  });
});
