import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ProjectController } from './project.controller'
import { CreateProjectDto, UpdateProjectDto } from './dto/project.dto'
import { GlobalValidationPipe } from '../common/validation/global-validation.pipe'
import type { Project } from '@generated/client'

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-1', name: 'P', description: null,
    createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  }
}

describe('ProjectController', () => {
  let controller: ProjectController
  let mockService: any

  beforeEach(() => {
    mockService = {
      create: vi.fn(),
      findById: vi.fn(),
      list: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    }
    controller = new ProjectController(mockService)
  })

  it('POST / calls service.create', async () => {
    mockService.create.mockResolvedValue(makeProject())
    await controller.create({ name: 'P' })
    expect(mockService.create).toHaveBeenCalledWith({ name: 'P' })
  })

  it('validates create payloads with the legacy class-validator DTO path', async () => {
    const pipe = new GlobalValidationPipe()

    await expect(pipe.transform({ name: 'P' }, { type: 'body', metatype: CreateProjectDto })).resolves.toEqual({ name: 'P' })
    await expect(pipe.transform({ name: 123 }, { type: 'body', metatype: CreateProjectDto })).rejects.toThrow()
    await expect(pipe.transform({ name: '' }, { type: 'body', metatype: CreateProjectDto })).rejects.toThrow()
  })

  it('validates update payloads with the legacy class-validator DTO path', async () => {
    const pipe = new GlobalValidationPipe()

    await expect(pipe.transform({ name: 'Renamed' }, { type: 'body', metatype: UpdateProjectDto })).resolves.toEqual({ name: 'Renamed' })
    await expect(pipe.transform({ name: 123 }, { type: 'body', metatype: UpdateProjectDto })).rejects.toThrow()
    await expect(pipe.transform({ name: '' }, { type: 'body', metatype: UpdateProjectDto })).rejects.toThrow()
  })

  it('GET / calls service.list', async () => {
    mockService.list.mockResolvedValue([])
    await controller.list()
    expect(mockService.list).toHaveBeenCalled()
  })

  it('GET /:id calls service.findById', async () => {
    mockService.findById.mockResolvedValue(makeProject())
    await controller.findById('proj-1')
    expect(mockService.findById).toHaveBeenCalledWith('proj-1')
  })

  it('PATCH /:id calls service.update', async () => {
    mockService.update.mockResolvedValue(makeProject())
    await controller.update('proj-1', { name: 'New' })
    expect(mockService.update).toHaveBeenCalledWith('proj-1', { name: 'New' })
  })

  it('DELETE /:id calls service.remove', async () => {
    mockService.remove.mockResolvedValue(undefined)
    await controller.remove('proj-1')
    expect(mockService.remove).toHaveBeenCalledWith('proj-1')
  })
})
