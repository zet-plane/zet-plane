import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { EdgeType, CreatedBy } from '@generated/client'

export class CreateEdgeDto {
  @ApiProperty({ description: 'Source node ID' })
  fromId!: string

  @ApiProperty({ description: 'Target node ID' })
  toId!: string

  @ApiProperty({ enum: EdgeType, enumName: 'EdgeType' })
  type!: EdgeType

  @ApiProperty({ enum: CreatedBy, enumName: 'CreatedBy' })
  createdBy!: CreatedBy
}

export class EdgeEntity {
  @ApiProperty() id!: string
  @ApiProperty() projectId!: string
  @ApiProperty({ description: 'Source node ID' }) fromId!: string
  @ApiProperty({ description: 'Target node ID' }) toId!: string
  @ApiProperty({ enum: EdgeType, enumName: 'EdgeType' }) type!: EdgeType
  @ApiProperty({ enum: CreatedBy, enumName: 'CreatedBy' }) createdBy!: CreatedBy
  @ApiProperty() createdAt!: Date
}
