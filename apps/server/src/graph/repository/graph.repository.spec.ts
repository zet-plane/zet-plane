import { describe, expect, it, vi } from 'vitest'
import { GraphRepository } from './graph.repository'

describe('GraphRepository', () => {
  describe('listProjectNodes', () => {
    it('includes the project root so composition containment can be rendered', async () => {
      const findMany = vi.fn().mockResolvedValue([])
      const repo = new GraphRepository({
        node: { findMany },
      } as never)

      await repo.listProjectNodes('p1')

      expect(findMany).toHaveBeenCalledWith({ where: { projectId: 'p1' } })
    })
  })
})
