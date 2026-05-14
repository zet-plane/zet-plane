import { describe, expect, it } from "vitest";
import { buildParentMap } from "./build-parent-map";
import type { ProjectGraph } from "./types";

const mkEdges = (pairs: [string, string][]): ProjectGraph["edges"] =>
  pairs.map(([from, to], i) => ({
    id: `e${i}`,
    projectId: "p",
    fromId: from,
    toId: to,
    type: "composition",
    createdBy: "human",
    createdAt: "2026-05-14T00:00:00Z",
  }));

describe("buildParentMap", () => {
  it("returns empty map when no composition edges", () => {
    const m = buildParentMap({ nodes: [], edges: [] });
    expect(m.size).toBe(0);
  });

  it("maps child to parent for composition edges", () => {
    const m = buildParentMap({
      nodes: [],
      edges: mkEdges([
        ["root", "a"],
        ["root", "b"],
        ["a", "c"],
      ]),
    });

    expect(m.get("a")).toBe("root");
    expect(m.get("b")).toBe("root");
    expect(m.get("c")).toBe("a");
  });

  it("ignores dependency edges", () => {
    const m = buildParentMap({
      nodes: [],
      edges: [
        {
          id: "e1",
          projectId: "p",
          fromId: "a",
          toId: "b",
          type: "dependency",
          createdBy: "human",
          createdAt: "2026-05-14T00:00:00Z",
        },
      ],
    });

    expect(m.size).toBe(0);
  });

  it("ignores dependency edges targeting the same child as a composition edge", () => {
    const m = buildParentMap({
      nodes: [],
      edges: [
        ...mkEdges([["root", "child"]]),
        {
          id: "e1",
          projectId: "p",
          fromId: "other",
          toId: "child",
          type: "dependency",
          createdBy: "human",
          createdAt: "2026-05-14T00:00:00Z",
        },
      ],
    });

    expect(m.get("child")).toBe("root");
    expect(m.size).toBe(1);
  });

  it("throws when a child has duplicate composition parents", () => {
    expect(() =>
      buildParentMap({
        nodes: [],
        edges: mkEdges([
          ["root", "child"],
          ["other", "child"],
        ]),
      }),
    ).toThrowError("Duplicate composition parent for child child: root and other");
  });
});
