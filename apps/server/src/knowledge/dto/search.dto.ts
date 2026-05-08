import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { EntryCategory, EntryStatus, CreatedBy, EmbeddingStatus } from '@generated/client'

export class SearchFilterDto {
  @ApiPropertyOptional({ type: [String], enum: EntryCategory, enumName: 'EntryCategory' })
  category?: EntryCategory[]

  @ApiPropertyOptional({ type: [String], enum: EntryStatus, enumName: 'EntryStatus' })
  status?: EntryStatus[]

  @ApiPropertyOptional({ type: [String], description: 'Filter by anchor node IDs' })
  nodeId?: string[]
}

export class StoreEmbeddingDto {
  @ApiProperty({ type: [Number], description: '1536-dimensional embedding vector' })
  vector!: number[]
}

export class SearchDto {
  @ApiProperty({ type: [Number], description: 'Query embedding vector (1536 dimensions)' })
  vector!: number[]

  @ApiPropertyOptional({ type: SearchFilterDto })
  filters?: SearchFilterDto

  @ApiPropertyOptional({ default: 10, description: 'Maximum number of results' })
  limit?: number

  @ApiPropertyOptional({ default: 0, description: 'Minimum cosine similarity threshold (0–1)' })
  threshold?: number
}

export class SearchResultEntity {
  @ApiProperty() id!: string
  @ApiProperty() projectId!: string
  @ApiProperty({ description: 'Anchor node ID' }) nodeId!: string
  @ApiProperty({ enum: EntryCategory, enumName: 'EntryCategory' }) category!: EntryCategory
  @ApiProperty() title!: string
  @ApiProperty({ type: 'object', additionalProperties: true }) body!: unknown
  @ApiProperty({ enum: EntryStatus, enumName: 'EntryStatus' }) status!: EntryStatus
  @ApiProperty({ enum: EmbeddingStatus, enumName: 'EmbeddingStatus' }) embeddingStatus!: EmbeddingStatus
  @ApiProperty({ enum: CreatedBy, enumName: 'CreatedBy' }) createdBy!: CreatedBy
  @ApiProperty() createdAt!: Date
  @ApiProperty() updatedAt!: Date
  @ApiProperty({ description: 'Cosine similarity score (0–1)' }) score!: number
}
