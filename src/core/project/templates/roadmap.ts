// Roadmap.md template rules - heading validation and fixing

import type { RoadmapHeadingValidation, TemplateDefinition } from './types'

// ============================================================================
// Expected Headings
// ============================================================================

/**
 * Expected headings in Roadmap.md.
 * Simplified to just Milestones.
 */
export const ROADMAP_EXPECTED_HEADINGS = ['## Milestones'] as const

// ============================================================================
// Template Definition
// ============================================================================

export const ROADMAP_DEFINITION: TemplateDefinition = {
  placeholders: [], // No placeholders in simplified templates
  minMeaningful: 50,
  treatEmptyAsTemplate: true,
}

// ============================================================================
// Heading Validation
// ============================================================================

/**
 * Validate that Roadmap.md contains expected headings.
 * Returns which headings are missing or extra.
 */
export function validateRoadmapHeadings(content: string): RoadmapHeadingValidation {
  // Extract all ## level headings from the content
  const headingPattern = /^(##)\s+(.+)$/gm
  const foundHeadings: string[] = []
  let hasMilestoneSubheadings = false
  let match

  while ((match = headingPattern.exec(content)) !== null) {
    const text = match[2].trim()
    foundHeadings.push(`## ${text}`)
  }

  // Check for ### level milestone headings (### M1, etc.)
  const milestonePattern = /^(###)\s+M\d+\s*[—–-]/gm
  if (milestonePattern.test(content)) {
    hasMilestoneSubheadings = true
  }

  // Check for missing expected headings
  const missingHeadings: string[] = []
  for (const expected of ROADMAP_EXPECTED_HEADINGS) {
    const found = foundHeadings.some((h) => {
      return h.toLowerCase() === expected.toLowerCase()
    })
    if (!found) {
      missingHeadings.push(expected)
    }
  }

  // Check for extra ## level headings (not in template)
  const expectedNormalized = ROADMAP_EXPECTED_HEADINGS.map((h) => h.toLowerCase())
  const extraHeadings: string[] = []
  for (const found of foundHeadings) {
    if (!expectedNormalized.includes(found.toLowerCase())) {
      extraHeadings.push(found)
    }
  }

  return {
    isValid: missingHeadings.length === 0,
    missingHeadings,
    extraHeadings,
    hasMilestoneSubheadings,
  }
}

// ============================================================================
// Heading Fixer
// ============================================================================

/**
 * Fix Roadmap.md by ensuring the Milestones heading is present.
 * Preserves existing content.
 * Does NOT use AI - purely structural fixes.
 */
export function fixRoadmapHeadings(content: string, _projectName: string): string {
  // Check if ## Milestones heading exists
  const hasMilestonesHeading = /^## Milestones\s*$/m.test(content)

  if (hasMilestonesHeading) {
    // Already has the heading, return as-is
    return content
  }

  // Add the Milestones heading at the beginning if missing
  const trimmedContent = content.trim()
  if (trimmedContent.length === 0) {
    return '## Milestones\n'
  }

  return `## Milestones\n\n${trimmedContent}\n`
}
