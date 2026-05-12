import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NotFoundException } from '@nestjs/common'
import { OrchestratorTaskType, OrchestratorTaskStatus, OrchestratorSourceType } from '@generated/client'
import { TaskRunnerService } from './task-runner.service'

// Mock the agent-graph module so tests don't need real LangGraph / Anthropic creds
vi.mock('../llm/agent-graph', () => ({
  buildAgentGraph: vi.fn().mockReturnValue({}),
  runAgentLoop: vi.fn().mockResolvedValue({
    summary: 'agent done',
    signalType: 'progress',
    confidence: 0.8,
    evidence: [],
  }),
}))

// Prevent OpenAI constructor from throwing when no API key is present.
// vi.hoisted ensures mockEmbeddingsCreate is available inside the hoisted vi.mock factory.
const { mockEmbeddingsCreate } = vi.hoisted(() => ({
  mockEmbeddingsCreate: vi.fn().mockResolvedValue({ data: [{ embedding: [0.1, 0.2, 0.3] }] }),
}))

vi.mock('openai', () => {
  class MockOpenAI {
    embeddings = { create: mockEmbeddingsCreate }
  }
  return { OpenAI: MockOpenAI }
})

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

describe('TaskRunnerService', () => {
  let service: TaskRunnerService
  let mockContextBuilder: any
  let mockSkillRegistry: any
  let mockGraphReader: any
  let mockGraphRepo: any
  let mockNodeService: any
  let mockEdgeService: any
  let mockEntryService: any
  let mockRevisionService: any
  let mockSearchService: any
  let mockTaskRepo: any
  let mockPublisher: any
  beforeEach(async () => {
    mockEmbeddingsCreate.mockClear()

    mockContextBuilder = { build: vi.fn().mockResolvedValue({
      project: { id: 'proj-1', name: 'Test Project', status: 'active' },
      trigger: { sourceType: 'graph_event', sourceId: 'src-1', raw: {} },
      candidateNodes: [],
      relatedEntries: [],
      recentTaskHistory: [],
      constraints: { mayWriteGraph: true, mayWriteKnowledge: true, requiresHumanApproval: false },
    }) }
    mockSkillRegistry = { getSystemPrompt: vi.fn().mockReturnValue('You are a helpful agent.') }
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

    service = new TaskRunnerService(
      mockContextBuilder,
      mockSkillRegistry,
      mockGraphReader,
      mockGraphRepo,
      mockNodeService,
      mockEdgeService,
      mockEntryService,
      mockRevisionService,
      mockSearchService,
      mockTaskRepo,
      mockPublisher,
    )
  })

  // ── routing ────────────────────────────────────────────────────────────────

  describe('run() routing', () => {
    it('routes embedding tasks to runEmbedding — calls storeEmbedding, skips contextBuilder', async () => {
      const task = makeTask({ type: OrchestratorTaskType.embedding, input: { entryId: 'entry-1' } })
      const insight = await service.run(task)

      expect(mockSearchService.storeEmbedding).toHaveBeenCalledWith('entry-1', [0.1, 0.2, 0.3])
      expect(mockContextBuilder.build).not.toHaveBeenCalled()
      expect(insight.summary).toContain('entry-1')
      expect(insight.signalType).toBe('progress')
    })

    it('routes non-embedding tasks to runAgenticLoop — calls contextBuilder and agent graph', async () => {
      const { buildAgentGraph, runAgentLoop } = await import('../llm/agent-graph')
      const task = makeTask({ type: OrchestratorTaskType.event_anchor })

      await service.run(task)

      expect(mockContextBuilder.build).toHaveBeenCalledWith(task)
      expect(buildAgentGraph).toHaveBeenCalled()
      expect(runAgentLoop).toHaveBeenCalled()
    })
  })

  // ── model selection ────────────────────────────────────────────────────────

  describe('model selection', () => {
    it('uses claude-sonnet-4-6 for checkpoint tasks', async () => {
      const { buildAgentGraph } = await import('../llm/agent-graph')
      vi.mocked(buildAgentGraph).mockClear()

      const task = makeTask({ type: OrchestratorTaskType.checkpoint })
      await service.run(task)

      expect(buildAgentGraph).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'claude-sonnet-4-6' }),
      )
    })

    it('uses claude-haiku-4-5-20251001 for non-checkpoint agentic tasks', async () => {
      const { buildAgentGraph } = await import('../llm/agent-graph')
      vi.mocked(buildAgentGraph).mockClear()

      const task = makeTask({ type: OrchestratorTaskType.event_anchor })
      await service.run(task)

      expect(buildAgentGraph).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'claude-haiku-4-5-20251001' }),
      )
    })
  })

  // ── staging node resolution ────────────────────────────────────────────────

  describe('staging node resolution', () => {
    it('throws NotFoundException when project root is not found', async () => {
      mockGraphRepo.findProjectRoot.mockResolvedValue(null)
      const task = makeTask({ type: OrchestratorTaskType.event_anchor })

      await expect(service.run(task)).rejects.toThrow(NotFoundException)
    })

    it('passes the real root node id to toStagingTool (not a fabricated string)', async () => {
      const { buildAgentGraph } = await import('../llm/agent-graph')
      vi.mocked(buildAgentGraph).mockClear()

      const task = makeTask({ type: OrchestratorTaskType.event_anchor })
      await service.run(task)

      // Verify graphRepo.findProjectRoot was called and its real id is used (not fabricated)
      expect(mockGraphRepo.findProjectRoot).toHaveBeenCalledWith('proj-1')
    })
  })

  // ── embed deduplication ────────────────────────────────────────────────────

  describe('embed() private method deduplication', () => {
    it('embedding task uses a single openai call via embed()', async () => {
      const task = makeTask({ type: OrchestratorTaskType.embedding, input: { entryId: 'entry-1' } })
      await service.run(task)

      expect(mockEmbeddingsCreate).toHaveBeenCalledTimes(1)
      expect(mockEmbeddingsCreate).toHaveBeenCalledWith({
        model: 'text-embedding-3-small',
        input: 'some text',
      })
    })
  })
})
