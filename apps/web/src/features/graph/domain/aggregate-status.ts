import type { AggregatedStatus, ProjectGraph } from "./types";

const SEVERITY: Record<"blocked" | "active" | "completed", number> = {
  blocked: 3,
  active: 2,
  completed: 1,
};

function emptyCounts(): AggregatedStatus["counts"] {
  return { blocked: 0, active: 0, completed: 0, archived: 0 };
}

export function aggregateStatus(graph: ProjectGraph): Map<string, AggregatedStatus> {
  const childrenOf = new Map<string, string[]>();

  for (const edge of graph.edges) {
    if (edge.type !== "composition") {
      continue;
    }

    const children = childrenOf.get(edge.fromId) ?? [];
    children.push(edge.toId);
    childrenOf.set(edge.fromId, children);
  }

  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const result = new Map<string, AggregatedStatus>();

  function visit(nodeId: string): AggregatedStatus {
    const cached = result.get(nodeId);
    if (cached) {
      return cached;
    }

    const node = byId.get(nodeId);
    if (!node) {
      const empty: AggregatedStatus = { worst: null, counts: emptyCounts() };
      result.set(nodeId, empty);
      return empty;
    }

    if (node.status === "completed") {
      const sealed: AggregatedStatus = { worst: null, counts: emptyCounts() };
      result.set(nodeId, sealed);
      return sealed;
    }

    const counts = emptyCounts();
    let worstSeverity = 0;
    let worst: AggregatedStatus["worst"] = null;

    const children = childrenOf.get(nodeId) ?? [];

    for (const childId of children) {
      const child = byId.get(childId);
      if (!child) {
        continue;
      }

      if (child.status !== "archived") {
        counts[child.status] += 1;

        const childSeverity = SEVERITY[child.status as keyof typeof SEVERITY];
        if (childSeverity > worstSeverity) {
          worstSeverity = childSeverity;
          worst = child.status;
        }
      }

      const aggregate = visit(childId);
      counts.blocked += aggregate.counts.blocked;
      counts.active += aggregate.counts.active;
      counts.completed += aggregate.counts.completed;

      if (aggregate.worst) {
        const aggregateSeverity = SEVERITY[aggregate.worst];
        if (aggregateSeverity > worstSeverity) {
          worstSeverity = aggregateSeverity;
          worst = aggregate.worst;
        }
      }
    }

    const aggregated: AggregatedStatus = { worst, counts };
    result.set(nodeId, aggregated);
    return aggregated;
  }

  for (const node of graph.nodes) {
    visit(node.id);
  }

  return result;
}
