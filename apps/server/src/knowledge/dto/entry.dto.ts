import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsEnum, IsOptional, IsString } from 'class-validator'
import { EntryCategory, EntryStatus, EmbeddingStatus, CreatedBy } from '@generated/client'

export class CreateEntryDto {
  @ApiPropertyOptional({ description: 'Anchor node ID. If omitted, entry is anchored to the project staging node.' })
  @IsOptional()
  @IsString()
  nodeId?: string

  @ApiProperty({ enum: EntryCategory, enumName: 'EntryCategory' })
  @IsEnum(EntryCategory)
  category!: EntryCategory

  @ApiProperty()
  @IsString()
  title!: string

  @ApiProperty({ description: 'Arbitrary JSON body content' })
  body!: unknown

  @ApiPropertyOptional({ description: 'Note describing this initial version' })
  @IsOptional()
  @IsString()
  changeNote?: string

  @ApiProperty({ enum: CreatedBy, enumName: 'CreatedBy' })
  @IsEnum(CreatedBy)
  createdBy!: CreatedBy
}

export class UpdateEntryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string

  @ApiPropertyOptional({ enum: EntryCategory, enumName: 'EntryCategory' })
  @IsOptional()
  @IsEnum(EntryCategory)
  category?: EntryCategory

  @ApiPropertyOptional({
    enum: EntryStatus,
    enumName: 'EntryStatus',
    description: 'Mutually exclusive with title/category/nodeId in the same request',
  })
  @IsOptional()
  @IsEnum(EntryStatus)
  status?: EntryStatus

  @ApiPropertyOptional({
    description: 'Re-anchor to a different node. Mutually exclusive with title/category/status.',
  })
  @IsOptional()
  @IsString()
  nodeId?: string
}

export class UpdateBodyDto {
  @ApiProperty({ description: 'New body content for this revision' })
  body!: unknown

  @ApiPropertyOptional({ description: 'Human-readable note about what changed' })
  @IsOptional()
  @IsString()
  changeNote?: string

  @ApiProperty({ enum: CreatedBy, enumName: 'CreatedBy' })
  @IsEnum(CreatedBy)
  createdBy!: CreatedBy
}

export class KnowledgeEntryEntity {
  @ApiProperty() id!: string
  @ApiProperty() projectId!: string
  @ApiProperty({ description: 'Anchor node ID' }) nodeId!: string
  @ApiProperty({ enum: EntryCategory, enumName: 'EntryCategory' }) category!: EntryCategory
  @ApiProperty() title!: string
  @ApiProperty() body!: unknown
  @ApiProperty({ enum: EntryStatus, enumName: 'EntryStatus' }) status!: EntryStatus
  @ApiProperty({ enum: EmbeddingStatus, enumName: 'EmbeddingStatus' }) embeddingStatus!: EmbeddingStatus
  @ApiProperty({ enum: CreatedBy, enumName: 'CreatedBy' }) createdBy!: CreatedBy
  @ApiProperty() createdAt!: Date
  @ApiProperty() updatedAt!: Date
}

export class KnowledgeRevisionEntity {
  @ApiProperty() id!: string
  @ApiProperty() entryId!: string
  @ApiProperty({ description: 'Auto-incremented version number starting at 1' }) version!: number
  @ApiProperty() body!: unknown
  @ApiPropertyOptional() changeNote?: string
  @ApiProperty({ enum: CreatedBy, enumName: 'CreatedBy' }) createdBy!: CreatedBy
  @ApiProperty() createdAt!: Date
}
