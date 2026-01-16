// Template evaluator - core evaluation logic for determining template fill status

import type { ExpectedCoreFile, TemplateStatus } from './snapshot'
import {
  TEMPLATE_DEFINITIONS,
  stripFrontmatter,
  normalize,
  stripPlaceholders,
  countUnfilledPlaceholders,
} from './templates'

// Re-export validation functions for backward compatibility
export {
  OVERVIEW_EXPECTED_HEADINGS,
  validateOverviewHeadings,
  fixOverviewHeadings,
  ROADMAP_EXPECTED_HEADINGS,
  validateRoadmapHeadings,
  fixRoadmapHeadings,
} from './templates'

// Re-export types for backward compatibility
export type { HeadingValidation as OverviewHeadingValidation } from './templates'
export type { RoadmapHeadingValidation } from './templates'

/**
 * Evaluate whether a core file is still template-only, thin, or meaningfully filled.
 * Heuristics are deterministic and based on the provided canonical templates.
 */
export function evaluateTemplateStatus(
  file: ExpectedCoreFile,
  content: string
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
