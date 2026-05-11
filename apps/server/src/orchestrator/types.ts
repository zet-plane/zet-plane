// apps/server/src/orchestrator/types.ts
import type { Prisma, OrchestratorTask as PrismaTask } from '@generated/client'

type JsonValue = Prisma.JsonValue

export type { OrchestratorTaskType, OrchestratorTaskStatus, OrchestratorSourceType } from '@generated/client'

export type OrchestratorTask = PrismaTask

export type SignalType =
  | 'progress'
  | 'blocker'
  | 'decision'
  | 'risk'
  | 'learning'
  | 'noise'

export interface AgentInsight {
  summary: string
  signalType: SignalType
  confidence: number
  evidence: Array<{
    sourceType: 'node' | 'knowledge_entry' | 'task'
    sourceId: string
    note: string
  }>
}

export interface NodeSnapshot {
  id: string
  projectId: string
  type: string
  title: string
  description: string | null
  status: string
  isCheckpoint: boolean
}

export interface KnowledgeEntrySnapshot {
  id: string
  projectId: string
  nodeId: string
  category: string
  title: string
  body: JsonValue
  status: string
}

export interface TaskHistorySnapshot {
  id: string
  type: string
  status: string
  sourceType: string
  sourceId: string
  modelResult: JsonValue | null
  createdAt: Date
}

export interface GraphSnapshot {
  nodes: NodeSnapshot[]
  edges: Array<{ id: string; fromId: string; toId: string; type: string }>
}

export interface OrchestratorContext {
  project: { id: string; name: string; status: string }
  trigger: { sourceType: string; sourceId: string; raw: JsonValue }
  candidateNodes: NodeSnapshot[]
  relatedEntries: KnowledgeEntrySnapshot[]
  recentTaskHistory: TaskHistorySnapshot[]
  subgraph?: GraphSnapshot
  constraints: {
    mayWriteGraph: boolean
    mayWriteKnowledge: boolean
    requiresHumanApproval: boolean
  }
}

export const MAX_ITERATIONS = 20
export const ORCHESTRATOR_TASKS_QUEUE = 'orchestrator-tasks'
