import type { EdgeResponse, NodeResponse } from '@zet-plane/contracts';
import type { ProjectGraph } from './types';

export type PeripheralStub = {
  external: NodeResponse;
  side: 'left' | 'right';
  jumpTargetId: string;
  edges: EdgeResponse[];
};

export type CanvasView = {
  hero: NodeResponse;
  isTopLevel: boolean;
  children: NodeResponse[];
  siblingDependencyEdges: EdgeResponse[];
  peripheralStubs: PeripheralStub[];
};

export function canvasView(
  graph: ProjectGraph,
  focusedNodeId: string | null,
): CanvasView {
  const nodesById = new Map(graph.nodes.map((n) => [n.id, n]));
  const compositionParentById = new Map<string, string>();
  for (const e of graph.edges) {
    if (e.type === 'composition') compositionParentById.set(e.toId, e.fromId);
  }

  const root = graph.nodes.find((n) => n.isProjectRoot);
  if (!root) {
    throw new Error('canvasView: project root not found in graph');
  }

  const hero = focusedNodeId ? (nodesById.get(focusedNodeId) ?? root) : root;
  const isTopLevel = hero.id === root.id;

  const childIds: string[] = [];
  for (const e of graph.edges) {
    if (e.type === 'composition' && e.fromId === hero.id) childIds.push(e.toId);
  }
  const childSet = new Set(childIds);
  const children = childIds
    .map((id) => nodesById.get(id))
    .filter((n): n is NodeResponse => n !== undefined);

  const siblingDependencyEdges: EdgeResponse[] = [];
  const stubsByExternalId = new Map<string, PeripheralStub>();

  for (const e of graph.edges) {
    if (e.type !== 'dependency') continue;
    const fromIn = childSet.has(e.fromId);
    const toIn = childSet.has(e.toId);

    if (fromIn && toIn) {
      siblingDependencyEdges.push(e);
      continue;
    }
    if (!fromIn && !toIn) continue;

    const externalId = fromIn ? e.toId : e.fromId;
    const external = nodesById.get(externalId);
    if (!external) continue;

    const side: 'left' | 'right' = fromIn ? 'right' : 'left';
    const existing = stubsByExternalId.get(externalId);
    if (existing) {
      existing.edges.push(e);
    } else {
      stubsByExternalId.set(externalId, {
        external,
        side,
        jumpTargetId:
          external.type === 'growth'
            ? (compositionParentById.get(external.id) ?? external.id)
            : external.id,
        edges: [e],
      });
    }
  }

  return {
    hero,
    isTopLevel,
    children,
    siblingDependencyEdges,
    peripheralStubs: Array.from(stubsByExternalId.values()),
  };
}
