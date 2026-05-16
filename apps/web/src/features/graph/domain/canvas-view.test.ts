import { describe, expect, it } from 'vitest';
import type { ProjectGraph } from './types';
import { canvasView } from './canvas-view';

const mkNode = (id: string, overrides: Partial<{
  isProjectRoot: boolean;
  type: 'scaffold' | 'growth' | 'staging';
  title: string;
}> = {}): any => ({
  id,
  projectId: 'p',
  isProjectRoot: overrides.isProjectRoot ?? false,
  role: 'regular',
  type: overrides.type ?? 'growth',
  title: overrides.title ?? id,
  description: null,
  status: 'active',
  isCheckpoint: false,
  checkpointResolution: null,
  createdBy: 'human',
  createdAt: '2026-05-16T00:00:00.000Z',
  updatedAt: '2026-05-16T00:00:00.000Z',
});

const mkEdge = (id: string, fromId: string, toId: string, type: 'composition' | 'dependency'): any => ({
  id, projectId: 'p', fromId, toId, type, createdBy: 'human',
  createdAt: '2026-05-16T00:00:00.000Z',
});

describe('canvasView', () => {
  it('returns project root as hero when focusedNodeId is null', () => {
    const graph: ProjectGraph = {
      nodes: [
        mkNode('root', { isProjectRoot: true, type: 'scaffold', title: 'Project' }),
        mkNode('s1', { type: 'scaffold', title: 'Phase 1' }),
        mkNode('s2', { type: 'scaffold', title: 'Phase 2' }),
      ],
      edges: [
        mkEdge('e1', 'root', 's1', 'composition'),
        mkEdge('e2', 'root', 's2', 'composition'),
        mkEdge('e3', 's1', 's2', 'dependency'),
      ],
    };
    const view = canvasView(graph, null);
    expect(view.hero.id).toBe('root');
    expect(view.isTopLevel).toBe(true);
    expect(view.children.map((c) => c.id).sort()).toEqual(['s1', 's2']);
    expect(view.siblingDependencyEdges.map((e) => e.id)).toEqual(['e3']);
    expect(view.peripheralStubs).toEqual([]);
  });

  it('returns scaffold as hero when focused on a scaffold with children', () => {
    const graph: ProjectGraph = {
      nodes: [
        mkNode('root', { isProjectRoot: true, type: 'scaffold' }),
        mkNode('s1', { type: 'scaffold', title: 'Phase 1' }),
        mkNode('g1', { type: 'growth', title: 'Work A' }),
        mkNode('g2', { type: 'growth', title: 'Work B' }),
      ],
      edges: [
        mkEdge('e1', 'root', 's1', 'composition'),
        mkEdge('e2', 's1', 'g1', 'composition'),
        mkEdge('e3', 's1', 'g2', 'composition'),
        mkEdge('e4', 'g1', 'g2', 'dependency'),
      ],
    };
    const view = canvasView(graph, 's1');
    expect(view.hero.id).toBe('s1');
    expect(view.isTopLevel).toBe(false);
    expect(view.children.map((c) => c.id).sort()).toEqual(['g1', 'g2']);
    expect(view.siblingDependencyEdges.map((e) => e.id)).toEqual(['e4']);
  });

  it('builds peripheral stubs for cross-boundary dependency edges', () => {
    const graph: ProjectGraph = {
      nodes: [
        mkNode('root', { isProjectRoot: true, type: 'scaffold' }),
        mkNode('s1', { type: 'scaffold' }),
        mkNode('s2', { type: 'scaffold' }),
        mkNode('g1', { type: 'growth' }),
        mkNode('g2', { type: 'growth' }),
      ],
      edges: [
        mkEdge('e1', 'root', 's1', 'composition'),
        mkEdge('e2', 'root', 's2', 'composition'),
        mkEdge('e3', 's1', 'g1', 'composition'),
        mkEdge('e4', 's2', 'g2', 'composition'),
        mkEdge('e5', 'g1', 'g2', 'dependency'),
      ],
    };
    const view = canvasView(graph, 's1');
    expect(view.children.map((c) => c.id)).toEqual(['g1']);
    expect(view.siblingDependencyEdges).toEqual([]);
    expect(view.peripheralStubs).toHaveLength(1);
    expect(view.peripheralStubs[0].external.id).toBe('g2');
    expect(view.peripheralStubs[0].edges.map((e) => e.id)).toEqual(['e5']);
  });

  it('returns empty children when hero has no composition children', () => {
    const graph: ProjectGraph = {
      nodes: [
        mkNode('root', { isProjectRoot: true, type: 'scaffold' }),
        mkNode('s1', { type: 'scaffold' }),
      ],
      edges: [mkEdge('e1', 'root', 's1', 'composition')],
    };
    const view = canvasView(graph, 's1');
    expect(view.hero.id).toBe('s1');
    expect(view.children).toEqual([]);
    expect(view.siblingDependencyEdges).toEqual([]);
    expect(view.peripheralStubs).toEqual([]);
  });
});
