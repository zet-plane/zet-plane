import { describe, expect, it } from 'vitest';
import type { ProjectGraph } from './types';
import { breadcrumb } from './breadcrumb';

const mkNode = (id: string, isProjectRoot = false): any => ({
  id, projectId: 'p', isProjectRoot, role: 'regular', type: 'scaffold',
  title: id.toUpperCase(), description: null, status: 'active',
  isCheckpoint: false, checkpointResolution: null, createdBy: 'human',
  createdAt: '2026-05-16T00:00:00.000Z', updatedAt: '2026-05-16T00:00:00.000Z',
});
const mkEdge = (id: string, fromId: string, toId: string): any => ({
  id, projectId: 'p', fromId, toId, type: 'composition', createdBy: 'human',
  createdAt: '2026-05-16T00:00:00.000Z',
});

describe('breadcrumb', () => {
  it('returns only the root when focusedNodeId is null', () => {
    const graph: ProjectGraph = {
      nodes: [mkNode('root', true), mkNode('s1')],
      edges: [mkEdge('e1', 'root', 's1')],
    };
    expect(breadcrumb(graph, null).map((s) => s.id)).toEqual(['root']);
  });

  it('returns root → focused for a direct child', () => {
    const graph: ProjectGraph = {
      nodes: [mkNode('root', true), mkNode('s1')],
      edges: [mkEdge('e1', 'root', 's1')],
    };
    expect(breadcrumb(graph, 's1').map((s) => s.id)).toEqual(['root', 's1']);
  });

  it('walks the full composition chain to a deep descendant', () => {
    const graph: ProjectGraph = {
      nodes: [mkNode('root', true), mkNode('s1'), mkNode('s2'), mkNode('g1')],
      edges: [
        mkEdge('e1', 'root', 's1'),
        mkEdge('e2', 's1', 's2'),
        mkEdge('e3', 's2', 'g1'),
      ],
    };
    expect(breadcrumb(graph, 'g1').map((s) => s.id)).toEqual([
      'root', 's1', 's2', 'g1',
    ]);
  });

  it('falls back to root only when focused node not found', () => {
    const graph: ProjectGraph = {
      nodes: [mkNode('root', true)],
      edges: [],
    };
    expect(breadcrumb(graph, 'missing').map((s) => s.id)).toEqual(['root']);
  });
});
