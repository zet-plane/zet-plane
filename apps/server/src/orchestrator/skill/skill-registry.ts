import { Injectable, OnModuleInit } from '@nestjs/common'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse as parseFrontmatter } from 'yaml'
import type { OrchestratorTaskType, SkillManifestEntry } from '../types'

type InternalEntry = SkillManifestEntry & { filePath: string }

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/

@Injectable()
export class SkillRegistry implements OnModuleInit {
  private manifests: InternalEntry[] = []
  private baseContent: string = ''

  constructor(private readonly skillsDir: string) {}

  async onModuleInit(): Promise<void> {
    await this.loadManifest()
  }

  async loadManifest(): Promise<void> {
    const dirs = await readdir(this.skillsDir, { withFileTypes: true })
    const entries: InternalEntry[] = []
    let baseContent = ''

    for (const dir of dirs) {
      if (!dir.isDirectory()) continue
      const filePath = join(this.skillsDir, dir.name, 'index.md')
      let raw: string
      try {
        raw = await readFile(filePath, 'utf-8')
      } catch {
        continue
      }

      const match = raw.match(FRONTMATTER_RE)
      if (!match) continue

      const fm = parseFrontmatter(match[1]) as {
        name: string
        description?: string
        applicable_tasks?: string[]
        base?: boolean
      }
      const body = match[2].trim()

      if (fm.base === true) {
        baseContent = body
        continue
      }

      entries.push({
        name: fm.name,
        description: fm.description ?? '',
        applicableTasks: (fm.applicable_tasks ?? []) as OrchestratorTaskType[],
        filePath,
      })
    }

    this.manifests = entries
    this.baseContent = baseContent
  }

  listSkills(): SkillManifestEntry[] {
    return this.manifests.map(({ filePath: _filePath, ...entry }) => entry)
  }

  getBaseContent(): string {
    return this.baseContent
  }

  async readSkillBody(name: string): Promise<string | null> {
    const entry = this.manifests.find((m) => m.name === name)
    if (!entry) return null

    const raw = await readFile(entry.filePath, 'utf-8')
    const match = raw.match(FRONTMATTER_RE)
    if (!match) return null
    return match[2].trim()
  }

  // Kept for backward compatibility — Task 4 will remove this
  getSystemPrompt(taskType: OrchestratorTaskType): string {
    const base = this.baseContent ? `## Skill: agent-base\n\n${this.baseContent}` : ''
    const applicable = this.manifests
      .filter((s) => s.applicableTasks.includes(taskType))
      .map((s) => `## Skill: ${s.name}\n\n`)
    const sections = [base, ...applicable].filter(Boolean)
    return sections.join('\n\n---\n\n')
  }
}
