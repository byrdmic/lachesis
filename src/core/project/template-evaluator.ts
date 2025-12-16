import { type ExpectedCoreFile, type TemplateStatus } from './snapshot.ts'

type TemplateDefinition = {
  placeholders: string[]
  minMeaningful: number
  treatEmptyAsTemplate: boolean
}

const TEMPLATE_DEFINITIONS: Record<ExpectedCoreFile, TemplateDefinition> = {
  'Archive.md': {
    placeholders: [
      '## Completed Tasks',
      '- [ ] (empty for now – Lachesis will append completed items here)',
      '## Completed Milestones',
      '- [ ] (empty for now – Lachesis will append completed milestones here)',
    ],
    minMeaningful: 40,
    treatEmptyAsTemplate: true,
  },
  'Ideas.md': {
    placeholders: [],
    minMeaningful: 40,
    treatEmptyAsTemplate: true,
  },
  'Log.md': {
    placeholders: ['# Logs', '## YYYY-MM-DD', 'Initial Log'],
    minMeaningful: 120,
    treatEmptyAsTemplate: true,
  },
  'Overview.md': {
    placeholders: [
      '## Elevator Pitch',
      '## Current Status',
      'TBD – this section will be updated automatically by Lachesis.',
    ],
    minMeaningful: 120,
    treatEmptyAsTemplate: true,
  },
  'Roadmap.md': {
    placeholders: [
      '## Progress Tracker',
      'current_epic:',
      'current_milestone:',
      'milestone_progress:',
      'notes:',
      '- This section will be updated automatically by Lachesis.',
      '## Epics',
      '## Milestones',
    ],
    minMeaningful: 120,
    treatEmptyAsTemplate: true,
  },
  'Tasks.md': {
    placeholders: [],
    minMeaningful: 40,
    treatEmptyAsTemplate: true,
  },
}

function stripFrontmatter(content: string): { body: string } {
  const frontmatterRegex = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/
  const match = content.match(frontmatterRegex)
  if (!match) return { body: content }
  return { body: content.slice(match[0].length) }
}

function normalize(text: string): string {
  return text.replace(/\r\n/g, '\n').trim()
}

function stripPlaceholders(text: string, placeholders: string[]): string {
  let result = text
  for (const ph of placeholders) {
    // remove both exact lines and inline occurrences
    const escaped = ph.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    result = result.replace(new RegExp(`^\\s*${escaped}\\s*$`, 'gmi'), '')
    result = result.replace(new RegExp(escaped, 'gmi'), '')
  }
  return result.trim()
}

/**
 * Evaluate whether a core file is still template-only, thin, or meaningfully filled.
 * Heuristics are deterministic and based on the provided canonical templates.
 */
export function evaluateTemplateStatus(
  file: ExpectedCoreFile,
  content: string,
): { status: TemplateStatus; reasons: string[] } {
  const def = TEMPLATE_DEFINITIONS[file]
  if (!def) {
    return { status: 'filled', reasons: ['No template rules configured'] }
  }

  const { body } = stripFrontmatter(content)
  const normalized = normalize(body)

  if (!normalized) {
    return def.treatEmptyAsTemplate
      ? { status: 'template_only', reasons: ['Body is empty'] }
      : { status: 'thin', reasons: ['No meaningful content detected'] }
  }

  // First pass: if only placeholders/headings remain
  const stripped = stripPlaceholders(normalized, def.placeholders)
  if (!stripped) {
    return {
      status: 'template_only',
      reasons: ['Only template headings/placeholders present'],
    }
  }

  // Character-level heuristic for meaningful content
  const meaningfulLength = stripped.length
  const reasons: string[] = []

  if (meaningfulLength < def.minMeaningful) {
    reasons.push(`Only ${meaningfulLength} chars of non-template content`)
    return { status: 'thin', reasons }
  }

  return { status: 'filled', reasons }
}


