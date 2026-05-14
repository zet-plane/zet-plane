import type { AggregatedStatus, AggregateWorstStatus, ProjectGraph } from "./types";

const SEVERITY: Record<AggregateWorstStatus, number> = {
  blocked: 3,
  active: 2,
  completed: 1,
};

function emptyCounts(): AggregatedStatus["counts"] {
  return { blocked: 0, active: 0, completed: 0, archived: 0 };
}

function isAggregateWorstStatus(status: string): status is AggregateWorstStatus {
  return status === "blocked" || status === "active" || status === "completed";
}

function createChildrenMap(graph: ProjectGraph): Map<string, string[]> {
  const parentByChild = new Map<string, string>();
  const childrenOf = new Map<string, Set<string>>();

  for (const edge of graph.edges) {
    if (edge.type !== "composition") {
      continue;
    }

    const existingParentId = parentByChild.get(edge.toId);
    if (existingParentId !== undefined && existingParentId !== edge.fromId) {
      throw new Error(
        `Duplicate composition parent for child ${edge.toId}: ${existingParentId} and ${edge.fromId}`,
      );
    }

    parentByChild.set(edge.toId, edge.fromId);

    const children = childrenOf.get(edge.fromId) ?? new Set<string>();
    children.add(edge.toId);
    childrenOf.set(edge.fromId, children);
  }

  return new Map(Array.from(childrenOf, ([parentId, childIds]) => [parentId, Array.from(childIds)]));
}

function assertAcyclic(childrenOf: Map<string, string[]>): void {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];

  function walk(nodeId: string): void {
    if (visited.has(nodeId)) {
      return;
    }

    if (visiting.has(nodeId)) {
      const cycleStart = stack.indexOf(nodeId);
      const cyclePath = cycleStart === -1 ? [...stack, nodeId] : [...stack.slice(cycleStart), nodeId];
      throw new Error(`Composition cycle detected: ${cyclePath.join(" -> ")}`);
    }

    visiting.add(nodeId);
    stack.push(nodeId);

    try {
      for (const childId of childrenOf.get(nodeId) ?? []) {
        walk(childId);
      }
    } finally {
      stack.pop();
      visiting.delete(nodeId);
    }

    visited.add(nodeId);
  }

  const nodeIds = new Set<string>();
  for (const [parentId, childIds] of childrenOf) {
    nodeIds.add(parentId);
    for (const childId of childIds) {
      nodeIds.add(childId);
    }
  }

  for (const nodeId of nodeIds) {
    walk(nodeId);
  }
}

export function aggregateStatus(graph: ProjectGraph): Map<string, AggregatedStatus> {
  const childrenOf = createChildrenMap(graph);
  assertAcyclic(childrenOf);

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

    if (node.status === "completed" || node.status === "archived") {
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

      if (isAggregateWorstStatus(child.status)) {
        counts[child.status] += 1;

        const childSeverity = SEVERITY[child.status];
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
