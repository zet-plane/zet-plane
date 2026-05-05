import { describe, it, expect } from 'vitest'
import { CycleDetectorService } from './cycle-detector.service'
import { EdgeType, CreatedBy } from '@generated/client'
import type { Edge } from '@generated/client'

function edge(fromId: string, toId: string, type: EdgeType = EdgeType.composition): Edge {
  return {
    id: `${fromId}->${toId}`,
    projectId: 'p1',
    fromId,
    toId,
    type,
    createdBy: CreatedBy.human,
    createdAt: new Date(),
  }
}

describe('CycleDetectorService', () => {
  const detector = new CycleDetectorService()

  describe('detect', () => {
    it('returns null when no cycle exists', () => {
      const edges = [edge('a', 'b'), edge('b', 'c')]
      expect(detector.detect('a', 'b', edges)).toBeNull()
    })

    it('detects a simple 3-node cycle', () => {
      // a→b, b→c already exist; adding c→a creates cycle
      const edges = [edge('a', 'b'), edge('b', 'c'), edge('c', 'a')]
      const result = detector.detect('c', 'a', edges)
      expect(result).not.toBeNull()
      expect(result).toContain('c')
      expect(result).toContain('a')
    })

    it('detects a 2-node cycle (a→b, b→a)', () => {
      const edges = [edge('a', 'b'), edge('b', 'a')]
      const result = detector.detect('b', 'a', edges)
      expect(result).not.toBeNull()
      expect(result).toContain('a')
      expect(result).toContain('b')
    })

    it('ignores reference edges — reference edge does not create a cycle', () => {
      // a→b (reference) exists; adding b→a (composition)
      // reference edge should not count as flow constraint
      const edges = [edge('a', 'b', EdgeType.reference), edge('b', 'a')]
      const result = detector.detect('b', 'a', edges)
      expect(result).toBeNull()
    })

    it('detects cycle through dependency edges', () => {
      const edges = [edge('a', 'b', EdgeType.dependency), edge('b', 'a', EdgeType.dependency)]
      const result = detector.detect('b', 'a', edges)
      expect(result).not.toBeNull()
    })

    it('returns null for linear chain (no cycle)', () => {
      const edges = [edge('root', 'a'), edge('a', 'b'), edge('b', 'c'), edge('c', 'd')]
      expect(detector.detect('c', 'd', edges)).toBeNull()
    })

    it('returns null when fromId equals toId (self-edge has no traversable path)', () => {
      expect(detector.detect('a', 'a', [edge('a', 'b'), edge('b', 'c')])).toBeNull()
    })
  })

  describe('findHighestInDegreeNode', () => {
    it('returns node with most in-edges within cycle path', () => {
      // cyclePath = [a, b, c]; b has 2 in-edges, a has 1, c has 0
      const cyclePath = ['a', 'b', 'c']
      const edges = [
        edge('x', 'b'), edge('y', 'b'), edge('z', 'a'),
      ]
      expect(detector.findHighestInDegreeNode(cyclePath, edges)).toBe('b')
    })

    it('uses DFS traversal order to break ties (first in path wins)', () => {
      // cyclePath = [a, b]; both have 1 in-edge — first in path (a) wins
      const cyclePath = ['a', 'b']
      const edges = [edge('x', 'a'), edge('y', 'b')]
      expect(detector.findHighestInDegreeNode(cyclePath, edges)).toBe('a')
    })

    it('returns first node when all nodes have zero in-edges', () => {
      const cyclePath = ['a', 'b', 'c']
      expect(detector.findHighestInDegreeNode(cyclePath, [])).toBe('a')
    })
  })
})
