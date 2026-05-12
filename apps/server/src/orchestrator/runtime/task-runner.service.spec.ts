// apps/server/src/orchestrator/runtime/task-runner.service.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NotFoundException } from '@nestjs/common'
import { OrchestratorTaskType, OrchestratorTaskStatus, OrchestratorSourceType } from '@generated/client'
import { TaskRunnerService } from './task-runner.service'

vi.mock('../agent/agent-graph', () => ({
  buildAgentGraph: vi.fn().mockReturnValue({}),
  runAgentLoop: vi.fn().mockResolvedValue({
    summary: 'agent done',
    signalType: 'progress',
    confidence: 0.8,
    evidence: [],
  }),
}))

const makeTask = (overrides: Record<string, unknown> = {}) => ({
  id: 'task-1',
  projectId: 'proj-1',
  type: OrchestratorTaskType.event_anchor,
  sourceType: OrchestratorSourceType.graph_event,
  sourceId: 'src-1',
  status: OrchestratorTaskStatus.pending,
  idempotencyKey: 'key-1',
  input: {},
  modelResult: null,
  error: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

const fakeRoot = { id: 'root-node-id', projectId: 'proj-1', isProjectRoot: true }
const fakeLlm = { bindTools: vi.fn().mockReturnValue({ invoke: vi.fn() }) }

describe('TaskRunnerService', () => {
  let service: TaskRunnerService
  let mockContextBuilder: any
  let mockPromptBuilder: any
  let mockGraphReader: any
  let mockGraphRepo: any
  let mockNodeService: any
  let mockEdgeService: any
  let mockEntryService: any
  let mockRevisionService: any
  let mockSearchService: any
  let mockTaskRepo: any
  let mockPublisher: any
  let mockLlmRegistry: any

  beforeEach(() => {
    mockContextBuilder = {
      build: vi.fn().mockResolvedValue({
        project: { id: 'proj-1', name: 'Test Project', status: 'active' },
        trigger: { sourceType: 'graph_event', sourceId: 'src-1', raw: {} },
        candidateNodes: [],
        relatedEntries: [],
        recentTaskHistory: [],
        constraints: { mayWriteGraph: true, mayWriteKnowledge: true, requiresHumanApproval: false },
      }),
    }
    mockPromptBuilder = {
      build: vi.fn().mockReturnValue({
        systemPrompt: 'You are a helpful agent.',
        userMessage: 'Task type: event_anchor\nProject: proj-1',
      }),
    }
    mockGraphReader = {}
    mockGraphRepo = { findProjectRoot: vi.fn().mockResolvedValue(fakeRoot) }
    mockNodeService = {}
    mockEdgeService = {}
    mockEntryService = {
      getEntry: vi.fn().mockResolvedValue({ body: 'some text', id: 'entry-1' }),
    }
    mockRevisionService = {}
    mockSearchService = { storeEmbedding: vi.fn().mockResolvedValue(undefined) }
    mockTaskRepo = {}
    mockPublisher = {}
    mockLlmRegistry = {
      getChatModelForTask: vi.fn().mockReturnValue(fakeLlm),
      embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    }

    service = new TaskRunnerService(
      mockContextBuilder,
      mockPromptBuilder,
      mockGraphReader,
      mockGraphRepo,
      mockNodeService,
      mockEdgeService,
      mockEntryService,
      mockRevisionService,
      mockSearchService,
      mockTaskRepo,
      mockPublisher,
      mockLlmRegistry,
    )
  })

  // ── routing ────────────────────────────────────────────────────────────────

  describe('run() routing', () => {
    it('routes embedding tasks to runEmbedding — calls storeEmbedding, skips contextBuilder', async () => {
      const task = makeTask({ type: OrchestratorTaskType.embedding, input: { entryId: 'entry-1' } })
      const insight = await service.run(task)

      expect(mockLlmRegistry.embed).toHaveBeenCalledWith('some text')
      expect(mockSearchService.storeEmbedding).toHaveBeenCalledWith('entry-1', [0.1, 0.2, 0.3])
      expect(mockContextBuilder.build).not.toHaveBeenCalled()
      expect(insight.summary).toContain('entry-1')
      expect(insight.signalType).toBe('progress')
    })

    it('routes non-embedding tasks to runAgenticLoop — calls contextBuilder and agent graph', async () => {
      const { buildAgentGraph, runAgentLoop } = await import('../agent/agent-graph')
      const task = makeTask({ type: OrchestratorTaskType.event_anchor })

      await service.run(task)

      expect(mockContextBuilder.build).toHaveBeenCalledWith(task)
      expect(buildAgentGraph).toHaveBeenCalled()
      expect(runAgentLoop).toHaveBeenCalled()
    })
  })

  // ── model selection ────────────────────────────────────────────────────────

  describe('model selection', () => {
    it('calls getChatModelForTask with the task type', async () => {
      const task = makeTask({ type: OrchestratorTaskType.checkpoint })
      await service.run(task)
      expect(mockLlmRegistry.getChatModelForTask).toHaveBeenCalledWith(OrchestratorTaskType.checkpoint)
    })

    it('calls getChatModelForTask for non-checkpoint tasks too', async () => {
      const task = makeTask({ type: OrchestratorTaskType.event_anchor })
      await service.run(task)
      expect(mockLlmRegistry.getChatModelForTask).toHaveBeenCalledWith(OrchestratorTaskType.event_anchor)
    })
  })

  // ── staging node resolution ────────────────────────────────────────────────

  describe('staging node resolution', () => {
    it('throws NotFoundException when project root is not found', async () => {
      mockGraphRepo.findProjectRoot.mockResolvedValue(null)
      const task = makeTask({ type: OrchestratorTaskType.event_anchor })
      await expect(service.run(task)).rejects.toThrow(NotFoundException)
    })

    it('passes the real root node id to toStagingTool', async () => {
      const task = makeTask({ type: OrchestratorTaskType.event_anchor })
      await service.run(task)
      expect(mockGraphRepo.findProjectRoot).toHaveBeenCalledWith('proj-1')
    })
  })

  // ── embed delegation ───────────────────────────────────────────────────────

  describe('embedding task', () => {
    it('delegates to registry.embed, not a local openai client', async () => {
      const task = makeTask({ type: OrchestratorTaskType.embedding, input: { entryId: 'entry-1' } })
      await service.run(task)
      expect(mockLlmRegistry.embed).toHaveBeenCalledWith('some text')
    })
  })
})
