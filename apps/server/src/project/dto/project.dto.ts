import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import type { Project } from '@generated/client'

export class CreateProjectDto {
  @ApiProperty()
  name!: string

  @ApiPropertyOptional()
  description?: string
}

export class UpdateProjectDto {
  @ApiPropertyOptional()
  name?: string

  @ApiPropertyOptional()
  description?: string
}

export class ProjectEntity implements Project {
  @ApiProperty() id!: string
  @ApiProperty() name!: string
  @ApiPropertyOptional() description!: string | null
  @ApiProperty() createdAt!: Date
  @ApiProperty() updatedAt!: Date
}
