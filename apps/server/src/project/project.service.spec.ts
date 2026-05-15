import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NotFoundDomainException } from '../common/exceptions/domain-exception'
import { ProjectService } from './project.service'
import type { Project } from '@generated/client'

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-1',
    name: 'Test Project',
    description: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

describe('ProjectService', () => {
  let service: ProjectService
  let mockRepo: any
  let mockGraphService: any

  beforeEach(() => {
    mockRepo = {
      createWithRootTx: vi.fn(),
      findById: vi.fn(),
      list: vi.fn(),
      update: vi.fn(),
      removeWithCascade: vi.fn(),
    }
    mockGraphService = { initProjectGraphInternal: vi.fn() }
    service = new ProjectService(mockRepo, mockGraphService as any)
  })

  describe('create', () => {
    it('inserts project, root node, and staging area in the same transaction', async () => {
      const project = makeProject()
      const projectGraph = { rootNode: { id: 'root-1' }, stagingNode: { id: 'staging-1' } }
      mockRepo.createWithRootTx.mockImplementation(async (_data: any, nodeInit: Function) => {
        const graph = await nodeInit({}, project.id)
        return { project, rootNode: graph.rootNode }
      })
      mockGraphService.initProjectGraphInternal.mockResolvedValue(projectGraph)

      const result = await service.create({ name: 'Test Project' })

      expect(mockRepo.createWithRootTx).toHaveBeenCalledWith(
        { name: 'Test Project' },
        expect.any(Function),
      )
      expect(mockGraphService.initProjectGraphInternal).toHaveBeenCalledWith(project.id, {})
      expect(result).toEqual(project)
    })

    it('rolls back if initProjectGraphInternal throws', async () => {
      mockRepo.createWithRootTx.mockImplementation(async (_data: any, nodeInit: Function) => {
        await nodeInit({}, 'proj-1')
      })
      mockGraphService.initProjectGraphInternal.mockRejectedValue(new Error('DB error'))

      await expect(service.create({ name: 'Test Project' })).rejects.toThrow('DB error')
    })
  })

  describe('assertExists', () => {
    it('resolves silently when project exists', async () => {
      mockRepo.findById.mockResolvedValue(makeProject())
      await expect(service.assertExists('proj-1')).resolves.toBeUndefined()
    })

    it('throws 404 when project does not exist', async () => {
      mockRepo.findById.mockResolvedValue(null)
      await expect(service.assertExists('missing')).rejects.toThrow(NotFoundDomainException)
    })
  })

  describe('findById', () => {
    it('returns project when found', async () => {
      const project = makeProject()
      mockRepo.findById.mockResolvedValue(project)
      await expect(service.findById('proj-1')).resolves.toEqual(project)
    })

    it('throws 404 when not found', async () => {
      mockRepo.findById.mockResolvedValue(null)
      await expect(service.findById('missing')).rejects.toThrow(NotFoundDomainException)
    })
  })

  describe('update', () => {
    it('updates project after asserting existence', async () => {
      const project = makeProject()
      mockRepo.findById.mockResolvedValue(project)
      mockRepo.update.mockResolvedValue({ ...project, name: 'Renamed' })

      const result = await service.update('proj-1', { name: 'Renamed' })
      expect(result.name).toBe('Renamed')
    })

    it('throws 404 when project does not exist', async () => {
      mockRepo.findById.mockResolvedValue(null)
      await expect(service.update('missing', { name: 'X' })).rejects.toThrow(NotFoundDomainException)
    })
  })

  describe('remove', () => {
    it('calls repo.removeWithCascade', async () => {
      mockRepo.findById.mockResolvedValue(makeProject())
      mockRepo.removeWithCascade.mockResolvedValue({ counts: { nodes: 3, edges: 2, entries: 1 } })

      await service.remove('proj-1')

      expect(mockRepo.removeWithCascade).toHaveBeenCalledWith('proj-1')
    })

    it('throws 404 if project does not exist', async () => {
      mockRepo.findById.mockResolvedValue(null)
      await expect(service.remove('missing')).rejects.toThrow(NotFoundDomainException)
    })
  })

  describe('list', () => {
    it('returns array from repo', async () => {
      mockRepo.list.mockResolvedValue([makeProject()])
      await expect(service.list()).resolves.toHaveLength(1)
    })
  })
})
