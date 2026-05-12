import { Injectable, OnModuleInit } from '@nestjs/common'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse as parseFrontmatter } from 'yaml'
import type { OrchestratorTaskType } from '../types'

type SkillEntry = {
  name: string
  applicableTasks: OrchestratorTaskType[]
  content: string
}

@Injectable()
export class SkillRegistry implements OnModuleInit {
  private skills: SkillEntry[] = []

  constructor(private readonly skillsDir: string) {}

  async onModuleInit(): Promise<void> {
    await this.loadSkills()
  }

  private async loadSkills(): Promise<void> {
    const dirs = await readdir(this.skillsDir, { withFileTypes: true })
    const entries: SkillEntry[] = []

    for (const dir of dirs) {
      if (!dir.isDirectory()) continue
      const indexPath = join(this.skillsDir, dir.name, 'index.md')
      let raw: string
      try {
        raw = await readFile(indexPath, 'utf-8')
      } catch {
        continue
      }

      const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
      if (!match) continue

      const frontmatter = parseFrontmatter(match[1]) as {
        name: string
        applicable_tasks?: string[]
      }
      const body = match[2].trim()

      entries.push({
        name: frontmatter.name,
        applicableTasks: (frontmatter.applicable_tasks ?? []) as OrchestratorTaskType[],
        content: body,
      })
    }

    this.skills = entries
  }

  getSystemPrompt(taskType: OrchestratorTaskType): string {
    const applicable = this.skills.filter((s) => s.applicableTasks.includes(taskType))
    if (!applicable.length) return ''
    return applicable
      .map((s) => `## Skill: ${s.name}\n\n${s.content}`)
      .join('\n\n---\n\n')
  }
}
