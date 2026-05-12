import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { OrchestratorTaskRepository } from '../../repository/orchestrator-task.repository'

export const getTaskHistoryTool = (taskRepo: OrchestratorTaskRepository) =>
  tool(
    async ({ projectId, limit }) => {
      const tasks = await taskRepo.findRecentByProject(projectId, limit ?? 10)
      const snapshots = tasks.map((t) => ({
        id: t.id,
        type: t.type,
        status: t.status,
        sourceId: t.sourceId,
        modelResult: t.modelResult,
        createdAt: t.createdAt,
      }))
      return JSON.stringify(snapshots)
    },
    {
      name: 'get_task_history',
      description: 'Get recent Orchestrator task summaries for this project',
      schema: z.object({
        projectId: z.string(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
    },
  )
