/**
 * Enrich Tasks Parser
 *
 * Types and utilities for the "Tasks: Enrich" workflow.
 * Handles parsing AI responses and applying enrichments to Tasks.md.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Enrichment content for a task
 */
export interface TaskEnrichmentContent {
  why: string
  considerations: string[]
  acceptance: string[]
  constraints: string[]
  prompt: string
}

/**
 * A task with its proposed enrichment from the AI
 */
export interface TaskEnrichment {
  id: string
  originalTask: string // Full line including checkbox
  taskText: string // Just the description
  sliceLink: string | null
  sourceComment: string | null
  enrichment: TaskEnrichmentContent
  confidenceScore: number // 0-1, how complete is context
  confidenceNote: string | null
  selected: boolean // User selection state
}

/**
 * User's final decision for an enriched task
 */
export interface EnrichTaskSelection {
  taskId: string
  selected: boolean
}

/**
 * AI response format for enrich-tasks workflow
 */
export interface EnrichTasksAIResponse {
  enrichments: Array<{
    originalTask: string
    taskText: string
    sliceLink?: string
    sourceComment?: string
    enrichment: {
      why: string
      considerations: string[]
      acceptance: string[]
      constraints?: string[]
      prompt: string
    }
    confidenceScore: number
    confidenceNote?: string
  }>
  summary: {
    tasksAnalyzed: number
    tasksEnriched: number
    tasksSkipped: number
    skipReasons: string[]
  }
}

/**
 * Summary info extracted from an enrich-tasks response
 */
export interface EnrichTasksSummary {
  tasksAnalyzed: number
  tasksEnriched: number
  tasksSkipped: number
  skipReasons: string[]
}

// ============================================================================
// Detection Functions
// ============================================================================

/**
 * Check if a message contains enrich-tasks JSON response
 */
export function containsEnrichTasksResponse(content: string): boolean {
  return (
    content.includes('"enrichments"') &&
    content.includes('"originalTask"') &&
    content.includes('"confidenceScore"') &&
    content.includes('"why"')
  )
}

// ============================================================================
// Parsing Functions
// ============================================================================

/**
 * Parse AI JSON response into TaskEnrichment array
 */
export function parseEnrichTasksResponse(aiResponse: string): TaskEnrichment[] {
  try {
    // Extract JSON from the response (it might be wrapped in markdown code blocks)
    let jsonStr = aiResponse.trim()

    // Try to extract JSON from code blocks
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim()
    }

    const parsed: EnrichTasksAIResponse = JSON.parse(jsonStr)

    if (!parsed.enrichments || !Array.isArray(parsed.enrichments)) {
      console.warn('Enrich tasks response missing enrichments array')
      return []
    }

    return parsed.enrichments.map((item, index) => ({
      id: `enrich-${index}`,
      originalTask: item.originalTask,
      taskText: item.taskText,
      sliceLink: item.sliceLink || null,
      sourceComment: item.sourceComment || null,
      enrichment: {
        why: item.enrichment.why,
        considerations: item.enrichment.considerations || [],
        acceptance: item.enrichment.acceptance || [],
        constraints: item.enrichment.constraints || [],
        prompt: item.enrichment.prompt || '',
      },
      confidenceScore: item.confidenceScore,
      confidenceNote: item.confidenceNote || null,
      selected: true, // Default to selected
    }))
  } catch (error) {
    console.error('Failed to parse enrich tasks response:', error)
    return []
  }
}

/**
 * Extract summary info from an enrich-tasks JSON response
 */
export function extractEnrichTasksSummary(content: string): EnrichTasksSummary | null {
  try {
    let jsonStr = content.trim()

    // Try to extract JSON from code blocks
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim()
    }

    const parsed = JSON.parse(jsonStr)

    if (parsed.summary) {
      return {
        tasksAnalyzed: parsed.summary.tasksAnalyzed ?? 0,
        tasksEnriched: parsed.summary.tasksEnriched ?? 0,
        tasksSkipped: parsed.summary.tasksSkipped ?? 0,
        skipReasons: parsed.summary.skipReasons ?? [],
      }
    }

    // Fallback: count enrichments if no summary provided
    if (parsed.enrichments && Array.isArray(parsed.enrichments)) {
      return {
        tasksAnalyzed: parsed.enrichments.length,
        tasksEnriched: parsed.enrichments.length,
        tasksSkipped: 0,
        skipReasons: [],
      }
    }

    return null
  } catch {
    return null
  }
}

// ============================================================================
// Enrichment Detection
// ============================================================================

/**
 * Detect tasks that already have enrichment blocks (blockquotes under them)
 */
export function detectExistingEnrichments(content: string): Set<string> {
  const alreadyEnriched = new Set<string>()
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Check if this is a task line
    if (/^\s*-\s*\[[ x]\]/.test(line)) {
      // Look at the next few lines for blockquote enrichment
      let j = i + 1
      while (j < lines.length) {
        const nextLine = lines[j].trim()
        // Skip empty lines
        if (nextLine === '') {
          j++
          continue
        }
        // If we hit a blockquote starting with >, it's enriched
        if (nextLine.startsWith('>')) {
          // Extract task text for matching
          const taskMatch = line.match(/^\s*-\s*\[[ x]\]\s*(.+?)(?:\s*\[\[|<!--|$)/)
          if (taskMatch) {
            alreadyEnriched.add(taskMatch[1].trim())
          }
          break
        }
        // If we hit another task or section, stop looking
        if (nextLine.startsWith('-') || nextLine.startsWith('#')) {
          break
        }
        j++
      }
    }
  }

  return alreadyEnriched
}

// ============================================================================
// Formatting Functions
// ============================================================================

/**
 * Format an enrichment as a markdown blockquote block
 */
export function formatEnrichmentBlock(enrichment: TaskEnrichment): string {
  const lines: string[] = []

  // Why
  lines.push(`> **Why:** ${enrichment.enrichment.why}`)

  // Considerations
  if (enrichment.enrichment.considerations.length > 0) {
    lines.push('> **Considerations:**')
    for (const consideration of enrichment.enrichment.considerations) {
      lines.push(`> - ${consideration}`)
    }
  }

  // Acceptance
  if (enrichment.enrichment.acceptance.length > 0) {
    lines.push('> **Acceptance:**')
    for (const criterion of enrichment.enrichment.acceptance) {
      lines.push(`> - ${criterion}`)
    }
  }

  // Constraints (optional)
  if (enrichment.enrichment.constraints.length > 0) {
    lines.push(`> **Constraints:** ${enrichment.enrichment.constraints.join('; ')}`)
  }

  // Prompt (collapsible in markdown)
  if (enrichment.enrichment.prompt) {
    lines.push('>')
    lines.push('> <details><summary><strong>Execution Prompt</strong></summary>')
    lines.push('>')
    // Indent each line of the prompt with blockquote marker
    const promptLines = enrichment.enrichment.prompt.split('\n')
    for (const promptLine of promptLines) {
      lines.push(`> ${promptLine}`)
    }
    lines.push('>')
    lines.push('> </details>')
  }

  return lines.join('\n')
}

// ============================================================================
// Apply Functions
// ============================================================================

/**
 * Apply selected enrichments to Tasks.md content
 */
export function applyEnrichments(
  tasksContent: string,
  enrichments: TaskEnrichment[],
  selections: EnrichTaskSelection[]
): string {
  // Build a map of selected enrichments by task text
  const selectedEnrichments = new Map<string, TaskEnrichment>()
  const selectionMap = new Map(selections.map((s) => [s.taskId, s.selected]))

  for (const enrichment of enrichments) {
    if (selectionMap.get(enrichment.id)) {
      // Use normalized task text as key for matching
      selectedEnrichments.set(normalizeTaskText(enrichment.taskText), enrichment)
    }
  }

  if (selectedEnrichments.size === 0) {
    return tasksContent
  }

  const lines = tasksContent.split('\n')
  const result: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    result.push(line)

    // Check if this is a task line
    if (/^\s*-\s*\[[ x]\]/.test(line)) {
      // Extract task text
      const taskMatch = line.match(/^\s*-\s*\[[ x]\]\s*(.+?)(?:\s*\[\[|<!--|$)/)
      if (taskMatch) {
        const taskText = normalizeTaskText(taskMatch[1].trim())
        const enrichment = selectedEnrichments.get(taskText)

        if (enrichment) {
          // Check if this task already has an enrichment block (skip if so)
          let hasExisting = false
          let j = i + 1
          while (j < lines.length) {
            const nextLine = lines[j].trim()
            if (nextLine === '') {
              j++
              continue
            }
            if (nextLine.startsWith('>')) {
              hasExisting = true
            }
            break
          }

          if (!hasExisting) {
            // Add empty line then enrichment block (empty line needed for Obsidian reading view)
            // Also add empty line after enrichment for visual separation from next task
            const enrichmentBlock = formatEnrichmentBlock(enrichment)
            result.push('')
            result.push(enrichmentBlock)
            result.push('')
          }
        }
      }
    }
  }

  return result.join('\n')
}

/**
 * Normalize task text for matching (remove extra whitespace, common variations)
 */
function normalizeTaskText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.,!?]+$/, '')
    .trim()
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get confidence level label
 */
export function getConfidenceLabel(score: number): 'High' | 'Medium' | 'Low' {
  if (score >= 0.7) return 'High'
  if (score >= 0.4) return 'Medium'
  return 'Low'
}

/**
 * Get confidence color class
 */
export function getConfidenceColorClass(score: number): string {
  if (score >= 0.7) return 'confidence-high'
  if (score >= 0.4) return 'confidence-medium'
  return 'confidence-low'
}
