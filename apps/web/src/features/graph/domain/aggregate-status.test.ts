import { describe, expect, it } from "vitest";

import { aggregateStatus } from "./aggregate-status";
import type { ProjectGraph } from "./types";

type Status = "active" | "blocked" | "completed" | "archived";

const node = (id: string, status: Status) => ({
  id,
  projectId: "p",
  isProjectRoot: false,
  role: "regular" as const,
  type: "scaffold" as const,
  title: id,
  description: null,
  status,
  isCheckpoint: false,
  checkpointResolution: null,
  createdBy: "human" as const,
  createdAt: "2026-05-14T00:00:00Z",
  updatedAt: "2026-05-14T00:00:00Z",
});

const composition = (from: string, to: string, i: number) => ({
  id: `e${i}`,
  projectId: "p",
  fromId: from,
  toId: to,
  type: "composition" as const,
  createdBy: "human" as const,
  createdAt: "2026-05-14T00:00:00Z",
});

describe("aggregateStatus", () => {
  it("returns null worst and zero counts for a leaf node", () => {
    const g: ProjectGraph = { nodes: [node("n1", "active")], edges: [] };

    const result = aggregateStatus(g);

    expect(result.get("n1")).toEqual({
      worst: null,
      counts: { blocked: 0, active: 0, completed: 0, archived: 0 },
    });
  });

  it("counts direct children", () => {
    const g: ProjectGraph = {
      nodes: [node("root", "active"), node("a", "blocked"), node("b", "active")],
      edges: [composition("root", "a", 0), composition("root", "b", 1)],
    };

    const result = aggregateStatus(g);

    expect(result.get("root")).toEqual({
      worst: "blocked",
      counts: { blocked: 1, active: 1, completed: 0, archived: 0 },
    });
  });

  it("propagates worst status transitively", () => {
    const g: ProjectGraph = {
      nodes: [node("root", "active"), node("a", "active"), node("b", "blocked")],
      edges: [composition("root", "a", 0), composition("a", "b", 1)],
    };

    const result = aggregateStatus(g);

    expect(result.get("root")?.worst).toBe("blocked");
    expect(result.get("root")?.counts).toEqual({
      blocked: 1,
      active: 1,
      completed: 0,
      archived: 0,
    });
  });

  it("excludes archived descendants from worst and counts", () => {
    const g: ProjectGraph = {
      nodes: [node("root", "active"), node("a", "archived")],
      edges: [composition("root", "a", 0)],
    };

    const result = aggregateStatus(g);

    expect(result.get("root")?.worst).toBe(null);
    expect(result.get("root")?.counts.archived).toBe(0);
  });

  it("seals a completed container - counts empty, worst null", () => {
    const g: ProjectGraph = {
      nodes: [node("root", "completed"), node("a", "blocked")],
      edges: [composition("root", "a", 0)],
    };

    const result = aggregateStatus(g);

    expect(result.get("root")).toEqual({
      worst: null,
      counts: { blocked: 0, active: 0, completed: 0, archived: 0 },
    });
  });

  it("worst ordering: blocked > active > completed", () => {
    const g: ProjectGraph = {
      nodes: [node("root", "active"), node("a", "completed"), node("b", "active")],
      edges: [composition("root", "a", 0), composition("root", "b", 1)],
    };

    expect(aggregateStatus(g).get("root")?.worst).toBe("active");
  });

  it("ignores dangling composition child ids", () => {
    const g: ProjectGraph = {
      nodes: [node("root", "active")],
      edges: [composition("root", "missing", 0)],
    };

    expect(aggregateStatus(g).get("root")).toEqual({
      worst: null,
      counts: { blocked: 0, active: 0, completed: 0, archived: 0 },
    });
  });

  it("does not double-count duplicate same-parent composition edges", () => {
    const g: ProjectGraph = {
      nodes: [node("root", "active"), node("child", "blocked")],
      edges: [composition("root", "child", 0), composition("root", "child", 1)],
    };

    expect(aggregateStatus(g).get("root")).toEqual({
      worst: "blocked",
      counts: { blocked: 1, active: 0, completed: 0, archived: 0 },
    });
  });

  it("throws when a child has duplicate composition parents", () => {
    const g: ProjectGraph = {
      nodes: [node("root", "active"), node("other", "active"), node("child", "blocked")],
      edges: [composition("root", "child", 0), composition("other", "child", 1)],
    };

    expect(() => aggregateStatus(g)).toThrowError(
      "Duplicate composition parent for child child: root and other",
    );
  });

  it("throws on composition cycles with the cycle path", () => {
    const g: ProjectGraph = {
      nodes: [node("a", "active"), node("b", "blocked"), node("c", "active")],
      edges: [composition("a", "b", 0), composition("b", "c", 1), composition("c", "a", 2)],
    };

    expect(() => aggregateStatus(g)).toThrowError("Composition cycle detected: a -> b -> c -> a");
  });
});
