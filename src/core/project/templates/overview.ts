// Overview.md template rules - heading validation, fixing, and placeholders

import type { HeadingValidation, TemplateDefinition } from './types'
import { COMMON_PLACEHOLDERS, stripFrontmatter } from './utils'

// ============================================================================
// Expected Headings
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

// ============================================================================
// Template Definition
// ============================================================================

/**
 * Placeholders specific to Overview.md template.
 */
export const OVERVIEW_PLACEHOLDERS = [
  ...COMMON_PLACEHOLDERS,
  '<What are you building, for whom, and why does it matter?>',
  '<What hurts today?>',
  '<Why does it hurt?>',
  "<What happens if you don't solve it?>",
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
]

export const OVERVIEW_DEFINITION: TemplateDefinition = {
  placeholders: OVERVIEW_PLACEHOLDERS,
  minMeaningful: 200,
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
// Heading Fixer
// ============================================================================

/**
 * Expected headings with their default placeholder content.
 */
const OVERVIEW_HEADINGS_WITH_CONTENT = [
  {
    heading: '## Elevator Pitch (1–2 sentences)',
    placeholder: '<What are you building, for whom, and why does it matter?>',
  },
  {
    heading: '## Problem Statement',
    placeholder:
      "- **Current pain:** <What hurts today?>\n- **Root cause (best guess):** <Why does it hurt?>\n- **Consequence of doing nothing:** <What happens if you don't solve it?>",
  },
  {
    heading: '## Target Users & Use Context',
    placeholder:
      '- **Primary user(s):** <Who?>\n- **User context:** <Where/when do they use it?>\n- **Non-users / excluded users:** <Who is explicitly not the target?>',
  },
  {
    heading: '## Value Proposition',
    placeholder:
      '- **Primary benefit:** <What changes for the user?>\n- **Differentiator:** <Why this vs alternatives?>',
  },
  { heading: '## Scope', placeholder: '' }, // Has sub-headings
  { heading: '### In-Scope', placeholder: '- <Bullets>' },
  { heading: '### Out-of-Scope (Anti-Goals)', placeholder: '- <Bullets>' },
  {
    heading: '## Success Criteria (Definition of "Done")',
    placeholder:
      '- **Minimum shippable success (MVP):**\n  - <Observable/testable bullets>\n- **Nice-to-have success:**\n  - <Bullets>\n- **Hard constraints that must remain true:**\n  - <Bullets>',
  },
  {
    heading: '## Constraints',
    placeholder:
      '- **Time:** <deadlines, cadence>\n- **Tech:** <stack constraints, hosting constraints>\n- **Money:** <budget or "as close to $0 as possible">\n- **Operational:** <privacy, local-first, offline, etc.>',
  },
  {
    heading: '## Reference Links',
    placeholder:
      '- Repo: <...>\n- Docs: <...>\n- Key decisions: (see [[Log]]; long-term outcomes in [[Archive]])',
  },
]

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
  for (const { heading, placeholder } of OVERVIEW_HEADINGS_WITH_CONTENT) {
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
