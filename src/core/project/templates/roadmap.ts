// Roadmap.md template rules - heading validation, fixing, and placeholders

import type { RoadmapHeadingValidation, TemplateDefinition } from './types'
import { COMMON_PLACEHOLDERS, stripFrontmatter } from './utils'

// ============================================================================
// Expected Headings
// ============================================================================

/**
 * Expected headings in Roadmap.md, in order.
 * These are the canonical headings from the template.
 * Note: Individual milestone headings (### M1, ### M2) and slice subheadings are dynamic.
 */
export const ROADMAP_EXPECTED_HEADINGS = [
  '## Current Focus',
  '## Milestone Index',
  '## Milestones',
  '## Vertical Slices',
  '## Cut / Deferred Milestones',
] as const

// ============================================================================
// Template Definition
// ============================================================================

/**
 * Placeholders specific to Roadmap.md template.
 */
export const ROADMAP_PLACEHOLDERS = [
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
]

export const ROADMAP_DEFINITION: TemplateDefinition = {
  placeholders: ROADMAP_PLACEHOLDERS,
  minMeaningful: 150,
  treatEmptyAsTemplate: true,
}

// ============================================================================
// Heading Validation
// ============================================================================

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

// ============================================================================
// Heading Fixer
// ============================================================================

/**
 * Expected headings with their default placeholder content.
 */
const ROADMAP_HEADINGS_WITH_CONTENT = [
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

/**
 * Default milestone template when none exists.
 */
const DEFAULT_MILESTONE_CONTENT = `
### M1 — <Milestone Title>
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
- Key log entries: [[Log]]`

/**
 * Default vertical slices template when none exists.
 */
const DEFAULT_VERTICAL_SLICES_CONTENT = `
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
<1-2 sentence description>`

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
  for (const { heading, placeholder } of ROADMAP_HEADINGS_WITH_CONTENT) {
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
        fixedSections.push(`\n${heading}${DEFAULT_MILESTONE_CONTENT}`)
      } else if (heading === '## Vertical Slices') {
        fixedSections.push(`\n${heading}${DEFAULT_VERTICAL_SLICES_CONTENT}`)
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
