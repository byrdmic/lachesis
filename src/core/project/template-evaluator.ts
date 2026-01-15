// Template evaluator for determining if a file has been filled in
import { type ExpectedCoreFile, type TemplateStatus } from './snapshot'

// ============================================================================
// Overview Heading Validation
// ============================================================================

/**
 * Expected headings in Overview.md, in order.
 * These are the canonical headings from the template.
 */
export const OVERVIEW_EXPECTED_HEADINGS = [
  '## Elevator Pitch',
  '## Problem Statement',
  '## Target Users & Use Context',
  '## Value Proposition',
  '## Scope',
  '### In-Scope',
  '### Out-of-Scope (Anti-Goals)',
  '## Success Criteria (Definition of "Done")',
  '## Constraints',
  '## Reference Links',
] as const

export type OverviewHeadingValidation = {
  isValid: boolean
  missingHeadings: string[]
  extraHeadings: string[]
}

/**
 * Validate that Overview.md contains all expected headings.
 * Returns which headings are missing or extra.
 */
export function validateOverviewHeadings(content: string): OverviewHeadingValidation {
  const { body } = stripFrontmatter(content)

  // Extract all headings from the content (## and ### level)
  const headingPattern = /^(#{2,3})\s+(.+)$/gm
  const foundHeadings: string[] = []
  let match

  while ((match = headingPattern.exec(body)) !== null) {
    const level = match[1]
    const text = match[2].trim()
    // Normalize: remove trailing content like "(1–2 sentences)"
    const normalizedText = text.replace(/\s*\([^)]*\)\s*$/, '').trim()
    foundHeadings.push(`${level} ${normalizedText}`)
  }

  // Check for missing expected headings
  const missingHeadings: string[] = []
  for (const expected of OVERVIEW_EXPECTED_HEADINGS) {
    // Normalize expected heading for comparison
    const expectedNormalized = expected.replace(/\s*\([^)]*\)\s*$/, '').trim()
    const found = foundHeadings.some((h) => {
      const hNormalized = h.replace(/\s*\([^)]*\)\s*$/, '').trim()
      return hNormalized.toLowerCase() === expectedNormalized.toLowerCase()
    })
    if (!found) {
      missingHeadings.push(expected)
    }
  }

  // Check for extra headings (not in template)
  const expectedNormalized = OVERVIEW_EXPECTED_HEADINGS.map((h) =>
    h.replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase()
  )
  const extraHeadings: string[] = []
  for (const found of foundHeadings) {
    const foundNorm = found.replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase()
    // Skip the main title heading (# Overview — ...)
    if (found.startsWith('## ') || found.startsWith('### ')) {
      if (!expectedNormalized.includes(foundNorm)) {
        extraHeadings.push(found)
      }
    }
  }

  return {
    isValid: missingHeadings.length === 0,
    missingHeadings,
    extraHeadings,
  }
}

// ============================================================================
// Roadmap Heading Validation
// ============================================================================

/**
 * Expected headings in Roadmap.md, in order.
 * These are the canonical headings from the template.
 * Note: Individual milestone headings (### M1, ### M2) and slice subheadings are dynamic and not validated here.
 */
export const ROADMAP_EXPECTED_HEADINGS = [
  '## Current Focus',
  '## Milestone Index',
  '## Milestones',
  '## Vertical Slices',
  '## Cut / Deferred Milestones',
] as const

export type RoadmapHeadingValidation = {
  isValid: boolean
  missingHeadings: string[]
  extraHeadings: string[]
  hasMilestoneSubheadings: boolean
}

/**
 * Validate that Roadmap.md contains all expected headings.
 * Returns which headings are missing or extra.
 */
export function validateRoadmapHeadings(content: string): RoadmapHeadingValidation {
  const { body } = stripFrontmatter(content)

  // Extract all headings from the content (## and ### level)
  const headingPattern = /^(#{2,3})\s+(.+)$/gm
  const foundHeadings: string[] = []
  let hasMilestoneSubheadings = false
  let match

  while ((match = headingPattern.exec(body)) !== null) {
    const level = match[1]
    const text = match[2].trim()
    // Normalize: remove trailing content like "(fast scan)" or "(kept intentionally small)"
    const normalizedText = text.replace(/\s*\([^)]*\)\s*$/, '').trim()
    foundHeadings.push(`${level} ${normalizedText}`)

    // Check for milestone subheadings (### M1, ### M2, etc.)
    if (level === '###' && /^M\d+\s*[—–-]/.test(text)) {
      hasMilestoneSubheadings = true
    }
  }

  // Check for missing expected headings
  const missingHeadings: string[] = []
  for (const expected of ROADMAP_EXPECTED_HEADINGS) {
    // Normalize expected heading for comparison
    const expectedNormalized = expected.replace(/\s*\([^)]*\)\s*$/, '').trim()
    const found = foundHeadings.some((h) => {
      const hNormalized = h.replace(/\s*\([^)]*\)\s*$/, '').trim()
      return hNormalized.toLowerCase() === expectedNormalized.toLowerCase()
    })
    if (!found) {
      missingHeadings.push(expected)
    }
  }

  // Check for extra headings (not in template) - only ## level, skip ### milestone headings
  const expectedNormalized = ROADMAP_EXPECTED_HEADINGS.map((h) =>
    h.replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase()
  )
  const extraHeadings: string[] = []
  for (const found of foundHeadings) {
    // Only check ## level headings, ### are for user-defined milestones
    if (found.startsWith('## ')) {
      const foundNorm = found.replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase()
      if (!expectedNormalized.includes(foundNorm)) {
        extraHeadings.push(found)
      }
    }
  }

  return {
    isValid: missingHeadings.length === 0,
    missingHeadings,
    extraHeadings,
    hasMilestoneSubheadings,
  }
}

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
      '<Slice Name>',
      '<1-2 sentence description of what it delivers>',
      '<1-2 sentence description>',
      '<One sentence. "We\'re trying to…">',
      '<One sentence value>',
      '<What exists when done?>',
      '<Demo-able bullet>',
      '<Testable bullet>',
      '<User can… bullet>',
      '<External constraint / other milestone>',
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
      '<Standalone task with no slice>',
      '<Standalone task>',
      '<Task description>',
      '<How you\'ll know it\'s done>',
      '<Thing blocked>',
      '<dependency>',
      '<unblock plan: <...>>',
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
 * Count how many <placeholder> patterns remain in the text.
 * Excludes common non-placeholder patterns like URLs, HTML tags, etc.
 */
function countUnfilledPlaceholders(text: string): number {
  // Match patterns like <...> that look like placeholders
  const matches = text.match(/<[^>]{2,}>/g)
  if (!matches) return 0

  // Filter out non-placeholder patterns
  const placeholderMatches = matches.filter((match) => {
    const inner = match.slice(1, -1) // Remove < and >

    // Skip URLs (http://, https://, ftp://, etc.)
    if (/^https?:\/\//i.test(inner) || /^ftp:\/\//i.test(inner)) return false

    // Skip email addresses
    if (/^[^@]+@[^@]+\.[^@]+$/.test(inner)) return false

    // Skip common HTML tags (opening, closing, self-closing)
    if (/^\/?\w+(\s+[^>]*)?$/.test(inner) && /^(a|b|i|u|p|br|hr|div|span|img|pre|code|strong|em|ul|ol|li|table|tr|td|th|h[1-6]|script|style|link|meta|head|body|html|input|button|form|label|select|option|textarea|iframe|video|audio|source|canvas|svg|path|circle|rect|line|g|defs|use)/i.test(inner.split(/\s/)[0].replace(/^\//, ''))) return false

    // Skip XML-style self-closing patterns
    if (/\/$/.test(inner)) return false

    // Skip patterns that look like code/technical content (contains = or : or .)
    if (/[=:]/.test(inner) && !/^[A-Z][a-z]/.test(inner)) return false

    // This looks like a placeholder (starts with capital letter or is all caps with spaces)
    return true
  })

  return placeholderMatches.length
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

/**
 * Fix Overview.md by ensuring all expected headings are present.
 * Adds missing headings with placeholder content, preserves existing content.
 * Does NOT use AI - purely structural fixes.
 */
export function fixOverviewHeadings(content: string, projectName: string): string {
  const { body } = stripFrontmatter(content)

  // Extract frontmatter to preserve it
  const frontmatterMatch = content.match(/^(---\r?\n[\s\S]*?\r?\n---\r?\n?)/)
  const frontmatter = frontmatterMatch ? frontmatterMatch[1] : ''

  // Parse existing content into sections by heading
  const sections = parseOverviewSections(body)

  // Build the fixed content with all expected sections
  const fixedSections: string[] = []

  // Add the main title if not present
  if (!body.match(/^#\s+Overview/m)) {
    fixedSections.push(`# Overview — ${projectName}\n`)
  } else {
    // Extract and keep existing title
    const titleMatch = body.match(/^(#\s+Overview[^\n]*)\n?/)
    if (titleMatch) {
      fixedSections.push(titleMatch[1] + '\n')
    }
  }

  // Process each expected heading
  const expectedHeadingsWithContent: { heading: string; placeholder: string }[] = [
    { heading: '## Elevator Pitch (1–2 sentences)', placeholder: '<What are you building, for whom, and why does it matter?>' },
    { heading: '## Problem Statement', placeholder: '- **Current pain:** <What hurts today?>\n- **Root cause (best guess):** <Why does it hurt?>\n- **Consequence of doing nothing:** <What happens if you don\'t solve it?>' },
    { heading: '## Target Users & Use Context', placeholder: '- **Primary user(s):** <Who?>\n- **User context:** <Where/when do they use it?>\n- **Non-users / excluded users:** <Who is explicitly not the target?>' },
    { heading: '## Value Proposition', placeholder: '- **Primary benefit:** <What changes for the user?>\n- **Differentiator:** <Why this vs alternatives?>' },
    { heading: '## Scope', placeholder: '' }, // Has sub-headings
    { heading: '### In-Scope', placeholder: '- <Bullets>' },
    { heading: '### Out-of-Scope (Anti-Goals)', placeholder: '- <Bullets>' },
    { heading: '## Success Criteria (Definition of "Done")', placeholder: '- **Minimum shippable success (MVP):**\n  - <Observable/testable bullets>\n- **Nice-to-have success:**\n  - <Bullets>\n- **Hard constraints that must remain true:**\n  - <Bullets>' },
    { heading: '## Constraints', placeholder: '- **Time:** <deadlines, cadence>\n- **Tech:** <stack constraints, hosting constraints>\n- **Money:** <budget or "as close to $0 as possible">\n- **Operational:** <privacy, local-first, offline, etc.>' },
    { heading: '## Reference Links', placeholder: '- Repo: <...>\n- Docs: <...>\n- Key decisions: (see [[Log]]; long-term outcomes in [[Archive]])' },
  ]

  for (const { heading, placeholder } of expectedHeadingsWithContent) {
    // Normalize heading for lookup
    const headingNorm = heading.replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase()
    const existingContent = sections.get(headingNorm)

    if (existingContent !== undefined) {
      // Use existing heading and content
      fixedSections.push(`\n${heading}\n${existingContent}`)
    } else {
      // Add missing heading with placeholder
      fixedSections.push(`\n${heading}\n${placeholder}`)
    }
  }

  return frontmatter + fixedSections.join('\n').trim() + '\n'
}

/**
 * Parse Overview.md body into sections keyed by normalized heading.
 */
function parseOverviewSections(body: string): Map<string, string> {
  const sections = new Map<string, string>()
  const lines = body.split('\n')

  let currentHeading: string | null = null
  let currentContent: string[] = []

  for (const line of lines) {
    const headingMatch = line.match(/^(#{2,3})\s+(.+)$/)

    if (headingMatch) {
      // Save previous section
      if (currentHeading) {
        sections.set(currentHeading, currentContent.join('\n').trim())
      }

      // Start new section
      const text = headingMatch[2].trim()
      const normalizedText = text.replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase()
      currentHeading = `${headingMatch[1]} ${normalizedText}`
      currentContent = []
    } else if (currentHeading) {
      // Skip main title lines
      if (!line.match(/^#\s+Overview/)) {
        currentContent.push(line)
      }
    }
  }

  // Save last section
  if (currentHeading) {
    sections.set(currentHeading, currentContent.join('\n').trim())
  }

  return sections
}

/**
 * Fix Roadmap.md by ensuring all expected headings are present.
 * Adds missing headings with placeholder content, preserves existing content.
 * Does NOT use AI - purely structural fixes.
 */
export function fixRoadmapHeadings(content: string, projectName: string): string {
  const { body } = stripFrontmatter(content)

  // Extract frontmatter to preserve it
  const frontmatterMatch = content.match(/^(---\r?\n[\s\S]*?\r?\n---\r?\n?)/)
  const frontmatter = frontmatterMatch ? frontmatterMatch[1] : ''

  // Parse existing content into sections by heading
  const sections = parseRoadmapSections(body)

  // Build the fixed content with all expected sections
  const fixedSections: string[] = []

  // Add the main title if not present
  if (!body.match(/^#\s+Roadmap/m)) {
    fixedSections.push(`# Roadmap — ${projectName}\n`)
  } else {
    // Extract and keep existing title
    const titleMatch = body.match(/^(#\s+Roadmap[^\n]*)\n?/)
    if (titleMatch) {
      fixedSections.push(titleMatch[1] + '\n')
    }
  }

  // Process each expected heading
  const expectedHeadingsWithContent: { heading: string; placeholder: string }[] = [
    {
      heading: '## Current Focus',
      placeholder: `- **Milestone:** M1 — <Milestone title>
- **Intent:** <One sentence. "We're trying to…">`,
    },
    {
      heading: '## Milestone Index (fast scan)',
      placeholder: `- M1 — <Milestone title> (Status: planned)
- M2 — <Milestone title> (Status: planned)`,
    },
    {
      heading: '## Milestones',
      placeholder: '', // Has sub-sections for individual milestones
    },
    {
      heading: '## Vertical Slices',
      placeholder: '', // Has sub-sections for milestone slices
    },
    {
      heading: '## Cut / Deferred Milestones (kept intentionally small)',
      placeholder: '- <If this grows, move detail to Archive.md with rationale.>',
    },
  ]

  for (const { heading, placeholder } of expectedHeadingsWithContent) {
    // Normalize heading for lookup
    const headingNorm = heading.replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase()
    const existingContent = sections.get(headingNorm)

    if (existingContent !== undefined) {
      // Use existing heading and content
      fixedSections.push(`\n${heading}\n${existingContent}`)
    } else {
      // Add missing heading with placeholder
      // For ## Milestones, add a template milestone if none exists
      if (heading === '## Milestones') {
        fixedSections.push(`\n${heading}\n\n### M1 — <Milestone Title>
**Status:** planned  <!-- planned | active | done | blocked | cut -->
**Why it matters:** <One sentence value>
**Outcome:** <What exists when done?>

**Definition of Done (observable)**
- <Demo-able bullet>
- <Testable bullet>
- <User can… bullet>

**Dependencies**
- <External constraint / other milestone>

**Links**
- Tasks: [[Tasks]]
- Key log entries: [[Log]]`)
      } else if (heading === '## Vertical Slices') {
        fixedSections.push(`\n${heading}

Vertical slices are the features/capabilities needed to achieve each milestone.
Each slice is a demo-able, end-to-end deliverable (typically 1-5 days of work).
Tasks in [[Tasks]] link back to slices here using \`[[Roadmap#VS1 — Slice Name]]\`.

### M1 Slices

#### VS1 — <Slice Name>
<1-2 sentence description of what it delivers>

#### VS2 — <Slice Name>
<1-2 sentence description>

### M2 Slices

#### VS3 — <Slice Name>
<1-2 sentence description>`)
      } else {
        fixedSections.push(`\n${heading}\n${placeholder}`)
      }
    }
  }

  return frontmatter + fixedSections.join('\n').trim() + '\n'
}

/**
 * Parse Roadmap.md body into sections keyed by normalized heading.
 * Preserves ### milestone subheadings within the ## Milestones section.
 */
function parseRoadmapSections(body: string): Map<string, string> {
  const sections = new Map<string, string>()
  const lines = body.split('\n')

  let currentHeading: string | null = null
  let currentContent: string[] = []

  for (const line of lines) {
    // Only treat ## level as section boundaries (not ###)
    const headingMatch = line.match(/^(##)\s+(.+)$/)

    if (headingMatch) {
      // Save previous section
      if (currentHeading) {
        sections.set(currentHeading, currentContent.join('\n').trim())
      }

      // Start new section
      const text = headingMatch[2].trim()
      const normalizedText = text.replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase()
      currentHeading = `## ${normalizedText}`
      currentContent = []
    } else if (currentHeading) {
      // Skip main title lines
      if (!line.match(/^#\s+Roadmap/)) {
        currentContent.push(line)
      }
    }
  }

  // Save last section
  if (currentHeading) {
    sections.set(currentHeading, currentContent.join('\n').trim())
  }

  return sections
}
