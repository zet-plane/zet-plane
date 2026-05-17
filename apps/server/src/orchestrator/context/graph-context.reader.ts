import { Injectable } from '@nestjs/common'
import { GraphRepository } from '../../graph/repository/graph.repository'
import type { NodeSnapshot, GraphSnapshot } from '../types'

@Injectable()
export class GraphContextReader {
  constructor(private readonly graphRepo: GraphRepository) {}

  async getCandidateNodes(projectId: string): Promise<NodeSnapshot[]> {
    const nodes = await this.graphRepo.listProjectNodes(projectId)
    return nodes
      .filter((n) => n.status !== 'archived')
      .map((n) => ({
        id: n.id,
        projectId: n.projectId,
        type: n.type,
        title: n.title,
        description: n.description,
        status: n.status,
        isCheckpoint: n.isCheckpoint,
      }))
  }

  async getSubgraph(nodeId: string): Promise<GraphSnapshot> {
    const { nodes, edges } = await this.graphRepo.getSubgraph(nodeId)
    return {
      nodes: nodes.map((n) => ({
        id: n.id,
        projectId: n.projectId,
        type: n.type,
        title: n.title,
        description: n.description,
        status: n.status,
        isCheckpoint: n.isCheckpoint,
      })),
      edges: edges.map((e) => ({
        id: e.id,
        fromId: e.fromId,
        toId: e.toId,
        type: e.type,
      })),
    }
  }
}
