// Shared frontmatter generator for all markdown files
import type { ProjectDefinition } from '../../core/project/types.ts'
import { todayDate } from '../../core/project/types.ts'

type FrontmatterOptions = {
  extraFields?: Record<string, string | number | string[]>
}

export function generateBaseFrontmatter(
  project: ProjectDefinition,
  options: FrontmatterOptions = {},
): string {
  const { extraFields = {} } = options

  const base = {
    type: 'project',
    project: project.name,
    slug: project.slug,
    status: project.status,
    release_phase: project.releasePhase,
    last_updated: todayDate(),
    current_milestone: '',
    repo: 'n/a',
  }

  const combined = { ...base, ...extraFields }

  const lines = Object.entries(combined).map(([key, value]) => {
    if (Array.isArray(value)) {
      if (value.length === 0) {
        return `${key}: []`
      }
      return `${key}:\n${value.map((v) => `  - "${v}"`).join('\n')}`
    }
    if (typeof value === 'string' && value.includes('\n')) {
      return `${key}: |\n  ${value.replace(/\n/g, '\n  ')}`
    }
    if (typeof value === 'string') {
      return `${key}: "${value}"`
    }
    return `${key}: ${value}`
  })

  return `---\n${lines.join('\n')}\n---\n`
}
