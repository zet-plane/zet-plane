import { describe, expect, it } from 'vitest'
import { OrchestratorTaskType, OrchestratorTaskStatus, OrchestratorSourceType } from '@generated/client'
import { OrchestratorTraceConfigService } from './orchestrator-trace-config.service'

const makeTask = (input: unknown) => ({
  id: 'task-1',
  projectId: 'proj-1',
  type: OrchestratorTaskType.event_anchor,
  sourceType: OrchestratorSourceType.manual,
  sourceId: 'src-1',
  status: OrchestratorTaskStatus.pending,
  idempotencyKey: 'key-1',
  input,
  modelResult: null,
  error: null,
  createdAt: new Date(),
  updatedAt: new Date(),
})

describe('OrchestratorTraceConfigService', () => {
  const service = new OrchestratorTraceConfigService()

  it('returns undefined when task input has no trace payload', () => {
    expect(service.fromTask(makeTask({ text: 'hello' }) as any)).toBeUndefined()
  })

  it('extracts runnable config from a valid trace payload', () => {
    expect(service.fromTask(makeTask({
      text: 'hello',
      __trace: {
        runName: 'eval:s1',
        tags: ['eval', 's1', 123, null],
        metadata: {
          evalCase: 'S-1',
          testName: 'P1–P4',
        },
      },
    }) as any)).toEqual({
      runName: 'eval:s1',
      tags: ['eval', 's1'],
      metadata: {
        evalCase: 'S-1',
        testName: 'P1–P4',
      },
    })
  })

  it('drops invalid trace fields instead of throwing', () => {
    expect(service.fromTask(makeTask({
      __trace: {
        runName: 123,
        tags: 'eval',
        metadata: ['bad'],
      },
    }) as any)).toBeUndefined()
  })
})
