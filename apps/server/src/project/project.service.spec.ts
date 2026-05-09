import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NotFoundException } from '@nestjs/common'
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
  let mockPublisher: any
  let mockNodeService: any

  beforeEach(() => {
    mockRepo = {
      createWithRootTx: vi.fn(),
      findById: vi.fn(),
      list: vi.fn(),
      update: vi.fn(),
      removeWithCascade: vi.fn(),
    }
    mockPublisher = { publish: vi.fn().mockResolvedValue(undefined) }
    mockNodeService = { initProjectRootInternal: vi.fn() }
    service = new ProjectService(mockRepo, mockPublisher, mockNodeService)
  })

  describe('create', () => {
    it('inserts project and root node in the same transaction', async () => {
      const project = makeProject()
      const rootNode = { id: 'root-1' }
      mockRepo.createWithRootTx.mockImplementation(async (_data: any, nodeInit: Function) => {
        const node = await nodeInit({}, project.id)
        return { project, rootNode: node }
      })
      mockNodeService.initProjectRootInternal.mockResolvedValue(rootNode)

      const result = await service.create({ name: 'Test Project' })

      expect(mockRepo.createWithRootTx).toHaveBeenCalledWith(
        { name: 'Test Project' },
        expect.any(Function),
      )
      expect(mockNodeService.initProjectRootInternal).toHaveBeenCalledWith(project.id, {})
      expect(result).toEqual(project)
    })

    it('publishes project.created with rootNodeId after commit', async () => {
      const project = makeProject()
      const rootNode = { id: 'root-1' }
      mockRepo.createWithRootTx.mockImplementation(async (_data: any, nodeInit: Function) => {
        const node = await nodeInit({}, project.id)
        return { project, rootNode: node }
      })
      mockNodeService.initProjectRootInternal.mockResolvedValue(rootNode)

      await service.create({ name: 'Test Project' })

      expect(mockPublisher.publish).toHaveBeenCalledWith({
        type: 'project.created',
        payload: { projectId: project.id, rootNodeId: 'root-1' },
      })
    })

    it('rolls back if initProjectRootInternal throws', async () => {
      mockRepo.createWithRootTx.mockImplementation(async (_data: any, nodeInit: Function) => {
        await nodeInit({}, 'proj-1')
      })
      mockNodeService.initProjectRootInternal.mockRejectedValue(new Error('DB error'))

      await expect(service.create({ name: 'Test Project' })).rejects.toThrow('DB error')
      expect(mockPublisher.publish).not.toHaveBeenCalled()
    })
  })

  describe('assertExists', () => {
    it('resolves silently when project exists', async () => {
      mockRepo.findById.mockResolvedValue(makeProject())
      await expect(service.assertExists('proj-1')).resolves.toBeUndefined()
    })

    it('throws 404 when project does not exist', async () => {
      mockRepo.findById.mockResolvedValue(null)
      await expect(service.assertExists('missing')).rejects.toThrow(NotFoundException)
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
      await expect(service.findById('missing')).rejects.toThrow(NotFoundException)
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
      await expect(service.update('missing', { name: 'X' })).rejects.toThrow(NotFoundException)
    })
  })

  describe('remove', () => {
    it('calls repo.removeWithCascade, not child service methods', async () => {
      mockRepo.findById.mockResolvedValue(makeProject())
      mockRepo.removeWithCascade.mockResolvedValue({ counts: { nodes: 3, edges: 2, entries: 1 } })

      await service.remove('proj-1')

      expect(mockRepo.removeWithCascade).toHaveBeenCalledWith('proj-1')
    })

    it('publishes project.deleted with cascaded counts', async () => {
      mockRepo.findById.mockResolvedValue(makeProject())
      mockRepo.removeWithCascade.mockResolvedValue({ counts: { nodes: 3, edges: 2, entries: 1 } })

      await service.remove('proj-1')

      expect(mockPublisher.publish).toHaveBeenCalledWith({
        type: 'project.deleted',
        payload: { projectId: 'proj-1', cascadedCounts: { nodes: 3, edges: 2, entries: 1 } },
      })
    })

    it('throws 404 if project does not exist', async () => {
      mockRepo.findById.mockResolvedValue(null)
      await expect(service.remove('missing')).rejects.toThrow(NotFoundException)
    })
  })

  describe('list', () => {
    it('returns array from repo', async () => {
      mockRepo.list.mockResolvedValue([makeProject()])
      await expect(service.list()).resolves.toHaveLength(1)
    })
  })
})
