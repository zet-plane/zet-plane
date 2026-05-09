import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsString, IsOptional } from 'class-validator'
import type { Project } from '@generated/client'

export class CreateProjectDto {
  @ApiProperty()
  @IsString()
  name!: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string
}

export class UpdateProjectDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string
}

export class ProjectEntity implements Project {
  @ApiProperty() id!: string
  @ApiProperty() name!: string
  @ApiPropertyOptional() description!: string | null
  @ApiProperty() createdAt!: Date
  @ApiProperty() updatedAt!: Date
}
