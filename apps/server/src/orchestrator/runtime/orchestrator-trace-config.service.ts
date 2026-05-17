import { Injectable } from '@nestjs/common'
import type { RunnableConfig } from '@langchain/core/runnables'
import type { OrchestratorTask } from '../types'

type TracePayload = {
  runName?: unknown
  tags?: unknown
  metadata?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

@Injectable()
export class OrchestratorTraceConfigService {
  fromTask(task: OrchestratorTask): RunnableConfig | undefined {
    if (!isRecord(task.input)) return undefined

    const trace = task.input.__trace
    if (!isRecord(trace)) return undefined

    const { runName, tags, metadata } = this.normalizeTrace(trace)
    if (!runName && !tags?.length && !metadata) return undefined

    return {
      ...(runName && { runName }),
      ...(tags?.length && { tags }),
      ...(metadata && { metadata }),
    }
  }

  private normalizeTrace(trace: TracePayload) {
    const runName = typeof trace.runName === 'string' ? trace.runName : undefined
    const tags = Array.isArray(trace.tags)
      ? trace.tags.filter((tag): tag is string => typeof tag === 'string')
      : undefined
    const metadata = isRecord(trace.metadata) ? trace.metadata : undefined

    return { runName, tags, metadata }
  }
}
