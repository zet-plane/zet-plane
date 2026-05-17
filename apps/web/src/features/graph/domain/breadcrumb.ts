import type { NodeResponse } from '@zet-plane/contracts';
import type { ProjectGraph } from './types';

export type BreadcrumbSegment = {
  id: string;
  title: string;
  isRoot: boolean;
};

export function breadcrumb(
  graph: ProjectGraph,
  focusedNodeId: string | null,
): BreadcrumbSegment[] {
  const nodesById = new Map(graph.nodes.map((n) => [n.id, n]));
  const root = graph.nodes.find((n) => n.isProjectRoot);
  if (!root) return [];

  const rootSeg: BreadcrumbSegment = { id: root.id, title: root.title, isRoot: true };
  if (!focusedNodeId || focusedNodeId === root.id) return [rootSeg];
  if (!nodesById.has(focusedNodeId)) return [rootSeg];

  const parentOf = new Map<string, string>();
  for (const e of graph.edges) {
    if (e.type === 'composition') parentOf.set(e.toId, e.fromId);
  }

  const chain: NodeResponse[] = [];
  let cur: string | undefined = focusedNodeId;
  const guard = new Set<string>();
  while (cur && !guard.has(cur)) {
    guard.add(cur);
    const node = nodesById.get(cur);
    if (!node) break;
    chain.unshift(node);
    if (cur === root.id) break;
    cur = parentOf.get(cur);
  }

  if (chain[0]?.id !== root.id) chain.unshift(root);
  return chain.map((n) => ({ id: n.id, title: n.title, isRoot: n.isProjectRoot }));
}
