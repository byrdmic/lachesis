/**
 * Project file validation and health assessment for Load Project flow.
 *
 * This module provides:
 * - Core file priority ranking
 * - Format/structure detection
 * - Gating conditions for workflows
 */

/**
 * Core files in priority order for inspection/remediation.
 * Higher priority files should be addressed first when loading a project.
 *
 * Priority rationale:
 * 1. Overview/Ideas - Project basis (what is this? what could it be?)
 * 2. Tasks - Action planning (what do we do next?)
 * 3. Roadmap - Milestones (where are we going?)
 * 4. Log - Reference/history (what happened?)
 * 5. Archive - Optional storage (what's done/cut?)
 */
export const CORE_FILE_PRIORITY = [
  'Overview.md',
  'Ideas.md',
  'Tasks.md',
  'Roadmap.md',
  'Log.md',
  'Archive.md',
] as const

export type CoreFileName = (typeof CORE_FILE_PRIORITY)[number]

/**
 * Expected sections/headers for each core file.
 * These are used to detect if a file matches the expected structure.
 */
export const EXPECTED_SECTIONS: Record<CoreFileName, string[]> = {
  'Overview.md': [
    '## Elevator Pitch',
    '## Problem Statement',
    '## Target Users',
    '## Value Proposition',
    '## Scope',
    '## Constraints',
  ],
  'Ideas.md': ['## Scratch Ideas', '## Open Questions'],
  'Tasks.md': ['## Next 1–3 Actions', '## Active Vertical Slices'],
  'Roadmap.md': ['## Current Focus', '## Milestone Index', '## Milestones'],
  'Log.md': [], // Log is freeform, just needs content
  'Archive.md': [], // Archive is freeform
}

/**
 * Sections that indicate content might be in the wrong file.
 * Key: file where section was found
 * Value: Array of [section pattern, correct file]
 */
export const MISPLACED_SECTIONS: Record<CoreFileName, Array<[RegExp, CoreFileName]>> = {
  'Overview.md': [
    [/## Next 1[–-]3 Actions/i, 'Tasks.md'],
    [/## Scratch Ideas/i, 'Ideas.md'],
  ],
  'Ideas.md': [],
  'Tasks.md': [
    [/## Elevator Pitch/i, 'Overview.md'],
    [/## Problem Statement/i, 'Overview.md'],
  ],
  'Roadmap.md': [
    [/## Next 1[–-]3 Actions/i, 'Tasks.md'],
  ],
  'Log.md': [],
  'Archive.md': [],
}

/**
 * Result of validating a single file's format/structure.
 */
export type FileFormatValidation = {
  file: CoreFileName
  exists: boolean
  matchesExpectedFormat: boolean
  missingSections: string[]
  misplacedContent: Array<{ section: string; belongsIn: CoreFileName }>
  hasPlaceholders: boolean
  contentLength: number
  isTemplate: boolean // True if file is mostly unfilled template
}

/**
 * Result of validating a project's readiness for workflows.
 */
export type ProjectReadiness = {
  isReady: boolean
  missingBasics: string[]
  prioritizedIssues: FileFormatValidation[]
  canOfferWorkflows: boolean
  gatingSummary: string
}

/**
 * Validate a single file's format against expected structure.
 */
export function validateFileFormat(
  fileName: CoreFileName,
  content: string | null,
): FileFormatValidation {
  const result: FileFormatValidation = {
    file: fileName,
    exists: content !== null,
    matchesExpectedFormat: false,
    missingSections: [],
    misplacedContent: [],
    hasPlaceholders: false,
    contentLength: content?.length ?? 0,
    isTemplate: false,
  }

  if (!content) {
    return result
  }

  // Check for placeholder markers (indicates unfilled template)
  const placeholderPattern = /<[^<>]+>/g
  const placeholders = content.match(placeholderPattern) ?? []
  result.hasPlaceholders = placeholders.length > 3 // A few is ok, many indicates template

  // Check for expected sections
  const expectedSections = EXPECTED_SECTIONS[fileName]
  for (const section of expectedSections) {
    if (!content.includes(section)) {
      result.missingSections.push(section)
    }
  }

  // Check for misplaced content
  const misplacedRules = MISPLACED_SECTIONS[fileName]
  for (const [pattern, belongsIn] of misplacedRules) {
    if (pattern.test(content)) {
      const match = content.match(pattern)
      result.misplacedContent.push({
        section: match?.[0] ?? pattern.source,
        belongsIn,
      })
    }
  }

  // Determine if format matches expectations
  result.matchesExpectedFormat =
    result.missingSections.length === 0 && result.misplacedContent.length === 0

  // Determine if it's mostly template (short content + placeholders)
  const contentWithoutFrontmatter = content.replace(/^---[\s\S]*?---\s*/m, '')
  const meaningfulContent = contentWithoutFrontmatter
    .replace(/<[^<>]+>/g, '') // Remove placeholders
    .replace(/^#+\s+.*$/gm, '') // Remove headers
    .replace(/^\s*[-*]\s*$/gm, '') // Remove empty bullets
    .trim()

  result.isTemplate = meaningfulContent.length < 200 && result.hasPlaceholders

  return result
}

/**
 * Assess a project's readiness for workflows.
 * Returns prioritized issues and whether workflows should be gated.
 */
export function assessProjectReadiness(
  fileContents: Map<CoreFileName, string | null>,
): ProjectReadiness {
  const validations: FileFormatValidation[] = []

  // Validate each core file in priority order
  for (const fileName of CORE_FILE_PRIORITY) {
    const content = fileContents.get(fileName) ?? null
    const validation = validateFileFormat(fileName, content)
    validations.push(validation)
  }

  // Determine missing basics
  const missingBasics: string[] = []

  // Check Overview.md (required for project basis)
  const overviewValidation = validations.find((v) => v.file === 'Overview.md')
  if (!overviewValidation?.exists) {
    missingBasics.push('Overview.md is missing')
  } else if (overviewValidation.isTemplate) {
    missingBasics.push('Overview.md has not been filled in')
  } else if (overviewValidation.missingSections.length > 3) {
    missingBasics.push('Overview.md is missing key sections')
  }

  // Check Tasks.md (required for action planning)
  const tasksValidation = validations.find((v) => v.file === 'Tasks.md')
  if (!tasksValidation?.exists) {
    missingBasics.push('Tasks.md is missing')
  } else if (tasksValidation.isTemplate) {
    missingBasics.push('Tasks.md has no actionable items')
  }

  // Check Roadmap.md (required for direction)
  const roadmapValidation = validations.find((v) => v.file === 'Roadmap.md')
  if (!roadmapValidation?.exists) {
    missingBasics.push('Roadmap.md is missing')
  } else if (roadmapValidation.isTemplate) {
    missingBasics.push('Roadmap.md has no milestones defined')
  }

  // Filter to only issues that need attention
  const prioritizedIssues = validations.filter(
    (v) => !v.exists || v.isTemplate || !v.matchesExpectedFormat,
  )

  // Determine if workflows can be offered
  const canOfferWorkflows = missingBasics.length === 0

  // Build gating summary
  let gatingSummary: string
  if (canOfferWorkflows) {
    gatingSummary = 'Project has sufficient basis for workflows.'
  } else if (missingBasics.length === 1) {
    gatingSummary = `Before workflows: ${missingBasics[0]}`
  } else {
    gatingSummary = `Before workflows, address: ${missingBasics.slice(0, 2).join('; ')}${missingBasics.length > 2 ? '...' : ''}`
  }

  return {
    isReady: canOfferWorkflows,
    missingBasics,
    prioritizedIssues,
    canOfferWorkflows,
    gatingSummary,
  }
}

/**
 * Get a human-readable explanation of why a file's format doesn't match.
 */
export function explainFormatMismatch(validation: FileFormatValidation): string {
  if (!validation.exists) {
    return `${validation.file} does not exist`
  }

  const issues: string[] = []

  if (validation.isTemplate) {
    issues.push('still contains template placeholders')
  }

  if (validation.missingSections.length > 0) {
    const missing = validation.missingSections.slice(0, 2).join(', ')
    issues.push(`missing sections: ${missing}${validation.missingSections.length > 2 ? '...' : ''}`)
  }

  if (validation.misplacedContent.length > 0) {
    for (const { section, belongsIn } of validation.misplacedContent) {
      issues.push(`"${section}" belongs in ${belongsIn}`)
    }
  }

  if (issues.length === 0) {
    return `${validation.file} format is valid`
  }

  return `${validation.file}: ${issues.join('; ')}`
}

/**
 * Get the priority index for a core file (lower = higher priority).
 */
export function getFilePriority(fileName: CoreFileName): number {
  return CORE_FILE_PRIORITY.indexOf(fileName)
}

/**
 * Sort issues by file priority.
 */
export function sortByPriority<T extends { file: CoreFileName }>(issues: T[]): T[] {
  return [...issues].sort((a, b) => getFilePriority(a.file) - getFilePriority(b.file))
}
