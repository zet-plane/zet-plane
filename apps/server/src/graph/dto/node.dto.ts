import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { NodeType, NodeStatus, EdgeType, CreatedBy, NodeRole } from '@generated/client'
import { EdgeEntity } from './edge.dto'

export class CreateNodeDto {
  @ApiProperty({ enum: NodeType, enumName: 'NodeType' })
  type!: NodeType

  @ApiProperty()
  title!: string

  @ApiPropertyOptional()
  description?: string

  @ApiProperty({ enum: CreatedBy, enumName: 'CreatedBy' })
  createdBy!: CreatedBy

  @ApiPropertyOptional({ description: 'Parent node ID; defaults to project root if omitted' })
  parentNodeId?: string

  @ApiPropertyOptional({ enum: EdgeType, enumName: 'EdgeType', description: 'Edge type to parent; defaults to composition' })
  edgeType?: EdgeType
}

export class UpdateNodeDto {
  @ApiPropertyOptional()
  title?: string

  @ApiPropertyOptional()
  description?: string

  @ApiPropertyOptional()
  isCheckpoint?: boolean

  @ApiPropertyOptional({ enum: NodeStatus, enumName: 'NodeStatus' })
  status?: NodeStatus
}

export class ResolveCheckpointDto {
  @ApiProperty({ enum: ['continue', 'loop'], description: 'Resolution direction' })
  resolution!: 'continue' | 'loop'
}

export class DeleteNodeDto {
  @ApiPropertyOptional({
    enum: ['block', 'cascade', 'reparent-to-parent', 'reparent-to-root'],
    default: 'block',
    description: 'Strategy for handling child nodes',
  })
  strategy?: 'block' | 'cascade' | 'reparent-to-parent' | 'reparent-to-root'
}

export class NodeEntity {
  @ApiProperty() id!: string
  @ApiProperty() projectId!: string
  @ApiProperty() isProjectRoot!: boolean
  @ApiProperty({ enum: NodeRole, enumName: 'NodeRole' }) role!: NodeRole
  @ApiProperty({ enum: NodeType, enumName: 'NodeType' }) type!: NodeType
  @ApiProperty() title!: string
  @ApiPropertyOptional() description?: string
  @ApiProperty({ enum: NodeStatus, enumName: 'NodeStatus' }) status!: NodeStatus
  @ApiProperty() isCheckpoint!: boolean
  @ApiPropertyOptional({ description: 'Set only when isCheckpoint=true and status=blocked' })
  checkpointResolution?: string
  @ApiProperty({ enum: CreatedBy, enumName: 'CreatedBy' }) createdBy!: CreatedBy
  @ApiProperty() createdAt!: Date
  @ApiProperty() updatedAt!: Date
}

export class SubgraphEntity {
  @ApiProperty({ type: [NodeEntity] }) nodes!: NodeEntity[]
  @ApiProperty({ type: [EdgeEntity] }) edges!: EdgeEntity[]
}

export class DeleteNodeResultEntity {
  @ApiProperty({ type: [String], description: 'IDs of nodes affected by the deletion strategy' })
  affectedNodeIds!: string[]
}
