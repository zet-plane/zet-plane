import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createZodDto } from 'nestjs-zod'
import {
  createProjectEndpoint,
  updateProjectEndpoint,
} from '@zet-plane/contracts'
import { ProjectController } from './project.controller'
import { GlobalValidationPipe } from '../common/validation/global-validation.pipe'
import type { Project } from '@generated/client'

class CreateProjectDto extends createZodDto(createProjectEndpoint.request) {}
class UpdateProjectDto extends createZodDto(updateProjectEndpoint.request) {}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: '11111111-1111-4111-8111-111111111111', name: 'P', description: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'), updatedAt: new Date('2026-01-01T00:00:00.000Z'),
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
    const result = await controller.create({ name: 'P' })
    expect(mockService.create).toHaveBeenCalledWith({ name: 'P' })
    expect(result).toEqual(expect.objectContaining({ id: '11111111-1111-4111-8111-111111111111', createdAt: '2026-01-01T00:00:00.000Z' }))
  })

  it('validates create payloads with the shared Zod contract', () => {
    const pipe = new GlobalValidationPipe()

    expect(pipe.transform({ name: 'P' }, { type: 'body', metatype: CreateProjectDto })).toEqual({ name: 'P' })
    expect(() => pipe.transform({ name: 123 }, { type: 'body', metatype: CreateProjectDto })).toThrow()
    expect(() => pipe.transform({ name: '' }, { type: 'body', metatype: CreateProjectDto })).toThrow()
  })

  it('validates update payloads with the shared Zod contract', () => {
    const pipe = new GlobalValidationPipe()

    expect(pipe.transform({ name: 'Renamed' }, { type: 'body', metatype: UpdateProjectDto })).toEqual({ name: 'Renamed' })
    expect(() => pipe.transform({ name: 123 }, { type: 'body', metatype: UpdateProjectDto })).toThrow()
    expect(() => pipe.transform({ name: '' }, { type: 'body', metatype: UpdateProjectDto })).toThrow()
  })

  it('GET / calls service.list', async () => {
    mockService.list.mockResolvedValue([makeProject()])
    const result = await controller.list()
    expect(mockService.list).toHaveBeenCalled()
    expect(result).toEqual([expect.objectContaining({ id: '11111111-1111-4111-8111-111111111111', createdAt: '2026-01-01T00:00:00.000Z' })])
  })

  it('GET /:id calls service.findById', async () => {
    mockService.findById.mockResolvedValue(makeProject())
    await controller.findById({ id: '11111111-1111-4111-8111-111111111111' })
    expect(mockService.findById).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111')
  })

  it('PATCH /:id calls service.update', async () => {
    mockService.update.mockResolvedValue(makeProject())
    await controller.update({ id: '11111111-1111-4111-8111-111111111111' }, { name: 'New' })
    expect(mockService.update).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', { name: 'New' })
  })

  it('DELETE /:id calls service.remove', async () => {
    mockService.remove.mockResolvedValue(undefined)
    await controller.remove({ id: '11111111-1111-4111-8111-111111111111' })
    expect(mockService.remove).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111')
  })
})
