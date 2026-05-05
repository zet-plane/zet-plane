import { Injectable } from '@nestjs/common'
import { EdgeType } from '@generated/client'
import type { Edge } from '@generated/client'

@Injectable()
export class CycleDetectorService {
  detect(fromId: string, toId: string, edges: Edge[]): string[] | null {
    if (fromId === toId) return null
    const graph = this.buildAdjacency(edges.filter(e => e.type !== EdgeType.reference))
    const path: string[] = []
    const visited = new Set<string>()

    const dfs = (nodeId: string): boolean => {
      if (nodeId === fromId) return true
      if (visited.has(nodeId)) return false
      visited.add(nodeId)
      path.push(nodeId)
      for (const neighbor of graph[nodeId] ?? []) {
        if (dfs(neighbor)) return true
      }
      path.pop()
      return false
    }

    return dfs(toId) ? [fromId, ...path] : null
  }

  findHighestInDegreeNode(cyclePath: string[], edges: Edge[]): string {
    const inDegree = new Map<string, number>()
    for (const nodeId of cyclePath) inDegree.set(nodeId, 0)
    for (const e of edges) {
      if (inDegree.has(e.toId)) {
        inDegree.set(e.toId, (inDegree.get(e.toId) ?? 0) + 1)
      }
    }
    // First node in DFS order wins on ties
    let max = -1
    let result = cyclePath[0]
    for (const nodeId of cyclePath) {
      const degree = inDegree.get(nodeId) ?? 0
      if (degree > max) { max = degree; result = nodeId }
    }
    return result
  }

  private buildAdjacency(edges: Edge[]): Record<string, string[]> {
    const graph: Record<string, string[]> = {}
    for (const e of edges) {
      if (!graph[e.fromId]) graph[e.fromId] = []
      graph[e.fromId].push(e.toId)
    }
    return graph
  }
}
