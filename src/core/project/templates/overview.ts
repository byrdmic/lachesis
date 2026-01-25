// Overview.md template rules - heading validation and fixing

import type { HeadingValidation, TemplateDefinition } from './types'

// ============================================================================
// Expected Headings
// ============================================================================

/**
 * Expected headings in Overview.md, in order.
 * Simplified to 6 core sections.
 */
export const OVERVIEW_EXPECTED_HEADINGS = [
  '## Elevator Pitch',
  '## Problem Statement',
  '## Target Users',
  '## Value Proposition',
  '## Scope',
  '## Constraints / Principles',
] as const

// ============================================================================
// Template Definition
// ============================================================================

export const OVERVIEW_DEFINITION: TemplateDefinition = {
  placeholders: [], // No placeholders in simplified templates
  minMeaningful: 100,
  treatEmptyAsTemplate: true,
}

// ============================================================================
// Heading Validation
// ============================================================================

/**
 * Validate that Overview.md contains all expected headings.
 * Returns which headings are missing or extra.
 */
export function validateOverviewHeadings(content: string): HeadingValidation {
  // Extract all headings from the content (## level only)
  const headingPattern = /^(##)\s+(.+)$/gm
  const foundHeadings: string[] = []
  let match

  while ((match = headingPattern.exec(content)) !== null) {
    const level = match[1]
    const text = match[2].trim()
    foundHeadings.push(`${level} ${text}`)
  }

  // Check for missing expected headings
  const missingHeadings: string[] = []
  for (const expected of OVERVIEW_EXPECTED_HEADINGS) {
    const found = foundHeadings.some((h) => {
      return h.toLowerCase() === expected.toLowerCase()
    })
    if (!found) {
      missingHeadings.push(expected)
    }
  }

  // Check for extra headings (not in template)
  const expectedNormalized = OVERVIEW_EXPECTED_HEADINGS.map((h) => h.toLowerCase())
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
  }
}

// ============================================================================
// Heading Fixer
// ============================================================================

/**
 * Expected headings with empty placeholder content.
 */
const OVERVIEW_HEADINGS_WITH_CONTENT = [
  { heading: '## Elevator Pitch', placeholder: '' },
  { heading: '## Problem Statement', placeholder: '' },
  { heading: '## Target Users', placeholder: '' },
  { heading: '## Value Proposition', placeholder: '' },
  { heading: '## Scope', placeholder: '' },
  { heading: '## Constraints / Principles', placeholder: '' },
]

/**
 * Fix Overview.md by ensuring all expected headings are present.
 * Adds missing headings, preserves existing content.
 * Does NOT use AI - purely structural fixes.
 */
export function fixOverviewHeadings(content: string, _projectName: string): string {
  // Parse existing content into sections by heading
  const sections = parseOverviewSections(content)

  // Build the fixed content with all expected sections
  const fixedSections: string[] = []

  // Process each expected heading
  for (const { heading, placeholder } of OVERVIEW_HEADINGS_WITH_CONTENT) {
    const headingNorm = heading.toLowerCase()
    const existingContent = sections.get(headingNorm)

    if (existingContent !== undefined) {
      // Use existing heading and content
      fixedSections.push(`${heading}\n${existingContent}`)
    } else {
      // Add missing heading with placeholder
      fixedSections.push(`${heading}\n${placeholder}`)
    }
  }

  return fixedSections.join('\n\n').trim() + '\n'
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
    const headingMatch = line.match(/^(##)\s+(.+)$/)

    if (headingMatch) {
      // Save previous section
      if (currentHeading) {
        sections.set(currentHeading, currentContent.join('\n').trim())
      }

      // Start new section
      const text = headingMatch[2].trim()
      currentHeading = `## ${text}`.toLowerCase()
      currentContent = []
    } else if (currentHeading) {
      currentContent.push(line)
    }
  }

  // Save last section
  if (currentHeading) {
    sections.set(currentHeading, currentContent.join('\n').trim())
  }

  return sections
}
