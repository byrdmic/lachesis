import { type ExpectedCoreFile, type TemplateStatus } from './snapshot.ts'

type TemplateDefinition = {
  /** Placeholder patterns that indicate unfilled template content */
  placeholders: string[]
  /** Minimum characters of non-placeholder content to be considered "filled" */
  minMeaningful: number
  /** If true, an empty body is treated as template_only */
  treatEmptyAsTemplate: boolean
}

// Common placeholder patterns used across all templates
const COMMON_PLACEHOLDERS = [
  '<Project Name>',
  '<YYYYMMDD-shortslug>',
  '<...>',
  '<Bullets>',
  '<Idea>',
  '<Task>',
  '<url or obsidian link>',
]

const TEMPLATE_DEFINITIONS: Record<ExpectedCoreFile, TemplateDefinition> = {
  'Overview.md': {
    placeholders: [
      ...COMMON_PLACEHOLDERS,
      '<What are you building, for whom, and why does it matter?>',
      '<What hurts today?>',
      '<Why does it hurt?>',
      '<What happens if you don\'t solve it?>',
      '<Who?>',
      '<Where/when do they use it?>',
      '<Who is explicitly not the target?>',
      '<What changes for the user?>',
      '<Why this vs alternatives?>',
      '<Observable/testable bullets>',
      '<deadlines, cadence>',
      '<stack constraints, hosting constraints>',
      '<budget or "as close to $0 as possible">',
      '<privacy, local-first, offline, etc.>',
      '<Assumption>',
      '<Reason>',
      '<Test>',
      '<Name>',
      '<Risk>',
      '<Plan>',
      '<Signal>',
      '<Short Codename>',
    ],
    minMeaningful: 200,
    treatEmptyAsTemplate: true,
  },
  'Roadmap.md': {
    placeholders: [
      ...COMMON_PLACEHOLDERS,
      '<Milestone title>',
      '<Milestone Title>',
      '<Slice name>',
      '<Slice Name>',
      '<Vertical Slice Name>',
      '<One sentence. "We\'re trying to…">',
      '<One sentence value>',
      '<What exists when done?>',
      '<Demo-able bullet>',
      '<Testable bullet>',
      '<User can… bullet>',
      '<External constraint / other milestone>',
      '<Small concrete step (~15–60 mins)>',
      '<Next step>',
      '<VS?-T?>',
      '<If this grows, move detail to Archive.md with rationale.>',
    ],
    minMeaningful: 150,
    treatEmptyAsTemplate: true,
  },
  'Tasks.md': {
    placeholders: [
      ...COMMON_PLACEHOLDERS,
      '<Smallest concrete step (~15–60 minutes)>',
      '<Next step>',
      '<VS?-T?>',
      '<End-to-end capability you can demo>',
      '<Value / milestone alignment>',
      '<User can…>',
      '<System does…>',
      '<Verb + object>',
      '<How you\'ll know it\'s done>',
      '<Thing blocked>',
      '<dependency>',
    ],
    minMeaningful: 100,
    treatEmptyAsTemplate: true,
  },
  'Log.md': {
    placeholders: [
      ...COMMON_PLACEHOLDERS,
      '<Write whatever you want here. No structure required.>',
    ],
    minMeaningful: 50,
    treatEmptyAsTemplate: true,
  },
  'Ideas.md': {
    placeholders: [
      ...COMMON_PLACEHOLDERS,
      '<Question>',
      '<A / B / C>',
      '<What would decide it: <...>>',
    ],
    minMeaningful: 50,
    treatEmptyAsTemplate: true,
  },
  'Archive.md': {
    placeholders: [
      ...COMMON_PLACEHOLDERS,
      '<YYYY-MM-DD>',
      '<what shipped>',
      '<repo/commit/PR/notes>',
      '<what you learned / what changed>',
      '<Old Plan Title>',
      '<link to new plan>',
      '<rationale>',
      '<Idea Title>',
      '<Long-form rationale that doesn\'t belong in Overview/Log>',
      '<If revisited, what would need to be true: <...>>',
    ],
    minMeaningful: 100,
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
 * Count how many <placeholder> patterns remain in the text
 */
function countUnfilledPlaceholders(text: string): number {
  // Match patterns like <...> that look like placeholders
  const matches = text.match(/<[^>]{2,}>/g)
  return matches ? matches.length : 0
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

  // Count unfilled placeholder patterns
  const placeholderCount = countUnfilledPlaceholders(normalized)

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

  // High placeholder count indicates unfilled template
  if (placeholderCount > 5) {
    reasons.push(`${placeholderCount} unfilled placeholders remain`)
    return { status: 'template_only', reasons }
  }

  if (meaningfulLength < def.minMeaningful) {
    reasons.push(`Only ${meaningfulLength} chars of non-template content`)
    if (placeholderCount > 0) {
      reasons.push(`${placeholderCount} unfilled placeholders`)
    }
    return { status: 'thin', reasons }
  }

  // Some placeholders but enough content - still thin
  if (placeholderCount > 2) {
    reasons.push(`${placeholderCount} unfilled placeholders remain`)
    return { status: 'thin', reasons }
  }

  return { status: 'filled', reasons }
}
