import { describe, expect, it } from 'vitest';
import type { KnowledgeEntryResponse } from '@zet-plane/contracts';
import type { ProjectGraph } from './types';
import {
  buildCompositionParentMap,
  countCompositionChildren,
  getKnowledgeSummary,
  getNodeById,
  getOneHopEdgeIds,
  isLeafNode,
} from './graph-workbench';

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

const mkEdge = (
  id: string,
  fromId: string,
  toId: string,
  type: 'composition' | 'dependency',
): any => ({
  id,
  projectId: 'p',
  fromId,
  toId,
  type,
  createdBy: 'human',
  createdAt: '2026-05-16T00:00:00.000Z',
});

const mkEntry = (
  id: string,
  nodeId: string,
  category: KnowledgeEntryResponse['category'],
): KnowledgeEntryResponse => ({
  id,
  projectId: 'p',
  nodeId,
  category,
  title: id,
  body: {},
  status: 'published',
  embeddingStatus: 'indexed',
  createdBy: 'human',
  createdAt: '2026-05-16T00:00:00.000Z',
  updatedAt: '2026-05-16T00:00:00.000Z',
});

describe('graphWorkbench helpers', () => {
  it('builds composition parent ids by child id', () => {
    const graph: ProjectGraph = {
      nodes: [mkNode('parent'), mkNode('leaf')],
      edges: [mkEdge('e-parent', 'parent', 'leaf', 'composition')],
    };

    expect(buildCompositionParentMap(graph).get('leaf')).toBe('parent');
  });

  it('counts direct composition children by parent id', () => {
    const graph: ProjectGraph = {
      nodes: [mkNode('parent'), mkNode('leaf'), mkNode('dependent')],
      edges: [
        mkEdge('e-child', 'parent', 'leaf', 'composition'),
        mkEdge('e-dependency', 'parent', 'dependent', 'dependency'),
      ],
    };

    expect(countCompositionChildren(graph).get('parent')).toBe(1);
  });

  it('detects whether a node has no composition children', () => {
    const graph: ProjectGraph = {
      nodes: [mkNode('parent'), mkNode('leaf')],
      edges: [mkEdge('e-parent', 'parent', 'leaf', 'composition')],
    };

    expect(isLeafNode(graph, 'leaf')).toBe(true);
    expect(isLeafNode(graph, 'parent')).toBe(false);
  });

  it('summarizes knowledge entries with sorted categories', () => {
    const entries = [
      mkEntry('e1', 'n1', 'pitfall'),
      mkEntry('e2', 'n1', 'decision'),
      mkEntry('e3', 'n2', 'finding'),
    ];

    expect(getKnowledgeSummary(entries, 'n1')).toEqual({
      count: 2,
      pitfallCount: 1,
      categories: ['decision', 'pitfall'],
    });
  });

  it('returns one-hop dependency edge ids for a node', () => {
    const graph: ProjectGraph = {
      nodes: [mkNode('n1'), mkNode('source'), mkNode('target'), mkNode('child')],
      edges: [
        mkEdge('e-in', 'source', 'n1', 'dependency'),
        mkEdge('e-out', 'n1', 'target', 'dependency'),
        mkEdge('e-compose', 'n1', 'child', 'composition'),
        mkEdge('e-other', 'source', 'target', 'dependency'),
      ],
    };

    expect(getOneHopEdgeIds(graph.edges, 'n1')).toEqual(new Set(['e-in', 'e-out']));
  });

  it('returns the matching node or null when no node id is selected', () => {
    const nodes = [mkNode('n1'), mkNode('n2')];

    expect(getNodeById(nodes, 'n2')?.id).toBe('n2');
    expect(getNodeById(nodes, null)).toBeNull();
    expect(getNodeById(nodes, undefined)).toBeNull();
    expect(getNodeById(nodes, 'missing')).toBeNull();
  });
});
