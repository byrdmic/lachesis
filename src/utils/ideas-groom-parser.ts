/**
 * Ideas Groom Parser
 *
 * Types and utilities for the "Ideas: Groom Tasks" workflow.
 * Handles parsing AI responses and applying user selections to Tasks.md.
 */

import {
  type TaskDestination,
  type RoadmapSlice,
  parseTasksStructure,
  formatSliceLink,
  formatSliceDisplay,
  getDestinationLabel,
  destinationSupportsSliceLink,
} from './harvest-tasks-parser'

// Re-export shared types and utilities
export {
  type TaskDestination,
  type RoadmapSlice,
  parseTasksStructure,
  formatSliceLink,
  formatSliceDisplay,
  getDestinationLabel,
  destinationSupportsSliceLink,
}

// ============================================================================
// Constants
// ============================================================================

/** Emojis to denote where a task was moved */
export const MOVED_EMOJIS: Record<TaskDestination, string> = {
  'discard': '🗑️',
  'future-tasks': '📋',
  'active-tasks': '✅',
  'next-actions': '🎯',
}

// ============================================================================
// Types
// ============================================================================

/**
 * A task suggestion from the AI ideas groom analysis.
 */
export interface GroomedIdeaTask {
  id: string // Unique ID for UI tracking
  text: string // Task description
  ideaHeading: string // Original ## heading from Ideas.md
  ideaContext: string | null // Brief description/notes from the idea section
  suggestedDestination: TaskDestination
  suggestedSliceLink: string | null // AI-suggested slice link (e.g., "[[Roadmap#VS1 — Basic Modal Opens]]")
  reasoning: string | null // Why AI thinks this is actionable
  existingSimilar: string | null // If AI detected a similar existing task
  movedTo: TaskDestination | null // Where this task was moved (for history viewing)
}

/**
 * User's final decision for a groomed idea task
 */
export interface GroomedIdeaSelection {
  taskId: string
  destination: TaskDestination
  sliceLink: string | null // Full wiki link like "[[Roadmap#VS1 — Slice Name]]" or null for standalone
  customText: string | null // User can edit the task text
}

/**
 * AI response format for ideas-groom workflow
 */
export interface IdeasGroomAIResponse {
  tasks: Array<{
    text: string
    ideaHeading: string
    ideaContext?: string
    suggestedDestination: TaskDestination
    suggestedSliceLink?: string
    reasoning?: string
    existingSimilar?: string
  }>
  summary: {
    totalFound: number
    ideasProcessed: number
    duplicatesSkipped: number
  }
}

// ============================================================================
// Parsing Functions
// ============================================================================

/**
 * Check if a message contains ideas-groom JSON response
 */
export function containsIdeasGroomResponse(content: string): boolean {
  // Check for the distinctive JSON structure from ideas-groom workflow
  return (
    content.includes('"ideaHeading"') &&
    content.includes('"tasks"') &&
    (content.includes('"suggestedDestination"') || content.includes('"ideasProcessed"'))
  )
}

/**
 * Parse AI JSON response into GroomedIdeaTask array
 */
export function parseIdeasGroomResponse(aiResponse: string): GroomedIdeaTask[] {
  try {
    // Extract JSON from the response (it might be wrapped in markdown code blocks)
    let jsonStr = aiResponse.trim()

    // Try to extract JSON from code blocks
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim()
    }

    const parsed: IdeasGroomAIResponse = JSON.parse(jsonStr)

    if (!parsed.tasks || !Array.isArray(parsed.tasks)) {
      console.warn('Ideas groom response missing tasks array')
      return []
    }

    return parsed.tasks.map((task, index) => ({
      id: `ideas-groom-${index}`,
      text: task.text,
      ideaHeading: task.ideaHeading,
      ideaContext: task.ideaContext || null,
      suggestedDestination: task.suggestedDestination || 'future-tasks',
      suggestedSliceLink: task.suggestedSliceLink || null,
      reasoning: task.reasoning || null,
      existingSimilar: task.existingSimilar || null,
      movedTo: null, // Will be populated when checking Tasks.md for history viewing
    }))
  } catch (error) {
    console.error('Failed to parse ideas groom response:', error)
    return []
  }
}

/**
 * Check Tasks.md content to determine which ideas have been moved and where.
 * Updates the movedTo field on each task.
 */
export function detectMovedIdeas(
  tasks: GroomedIdeaTask[],
  tasksContent: string,
): GroomedIdeaTask[] {
  const structure = parseTasksStructure(tasksContent)
  const lines = tasksContent.split('\n')

  // Build a map of section ranges
  const sectionRanges: Array<{ start: number; end: number; destination: TaskDestination }> = []

  // Next Actions section
  if (structure.nextActionsLineNumber !== -1) {
    let end = structure.nextActionsLineNumber + 1
    while (end < lines.length && !lines[end].startsWith('## ') && !lines[end].startsWith('---')) {
      end++
    }
    sectionRanges.push({ start: structure.nextActionsLineNumber, end, destination: 'next-actions' })
  }

  // Active Tasks section
  if (structure.activeTasksLineNumber !== -1) {
    let end = structure.activeTasksLineNumber + 1
    while (end < lines.length && !lines[end].startsWith('## ') && !lines[end].startsWith('---')) {
      end++
    }
    sectionRanges.push({ start: structure.activeTasksLineNumber, end, destination: 'active-tasks' })
  }

  // Future Tasks section
  if (structure.futureTasksLineNumber !== -1) {
    let end = structure.futureTasksLineNumber + 1
    while (end < lines.length && !lines[end].startsWith('## ')) {
      end++
    }
    sectionRanges.push({ start: structure.futureTasksLineNumber, end, destination: 'future-tasks' })
  }

  // Check each task to see if it was moved
  return tasks.map((task) => {
    const cleanedHeading = cleanHeading(task.ideaHeading)
    // Look for the source comment pattern: <!-- from Ideas.md: <heading> -->
    const sourcePattern = `<!-- from Ideas.md: ${cleanedHeading} -->`

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(sourcePattern)) {
        // Found a match, determine which section it's in
        for (const range of sectionRanges) {
          if (i >= range.start && i < range.end) {
            return { ...task, movedTo: range.destination }
          }
        }
      }
    }

    return task
  })
}

// ============================================================================
// Apply Functions
// ============================================================================

/**
 * Apply user selections to Tasks.md content
 */
export function applyIdeasGroomSelections(
  tasksContent: string,
  selections: GroomedIdeaSelection[],
  tasks: GroomedIdeaTask[],
): string {
  const lines = tasksContent.split('\n')
  const structure = parseTasksStructure(tasksContent)

  // Group selections by destination
  const futureTasksToAdd: Array<{ text: string; task: GroomedIdeaTask; sliceLink: string | null }> = []
  const activeTasksToAdd: Array<{ text: string; task: GroomedIdeaTask; sliceLink: string | null }> = []
  const nextActionsToAdd: Array<{ text: string; task: GroomedIdeaTask; sliceLink: string | null }> = []

  // Build a map of task IDs to tasks
  const taskMap = new Map(tasks.map((t) => [t.id, t]))

  for (const selection of selections) {
    if (selection.destination === 'discard') continue

    const task = taskMap.get(selection.taskId)
    if (!task) continue

    const finalText = selection.customText || task.text
    const sliceLink = selection.sliceLink

    switch (selection.destination) {
      case 'future-tasks':
        futureTasksToAdd.push({ text: finalText, task, sliceLink })
        break

      case 'active-tasks':
        activeTasksToAdd.push({ text: finalText, task, sliceLink })
        break

      case 'next-actions':
        nextActionsToAdd.push({ text: finalText, task, sliceLink })
        // Also add to active tasks since next actions should be in active tasks
        activeTasksToAdd.push({ text: finalText, task, sliceLink })
        break
    }
  }

  // Track line insertions (we'll apply them in reverse order to maintain line numbers)
  const insertions: Array<{ lineNumber: number; content: string[] }> = []

  // 1. Add to Future Tasks section
  if (futureTasksToAdd.length > 0) {
    let insertLine = structure.futureTasksLineNumber
    if (insertLine === -1) {
      // Create section at end
      insertLine = lines.length
      const newLines = ['', '## Future Tasks']
      for (const item of futureTasksToAdd) {
        const sourceComment = ` <!-- from Ideas.md: ${cleanHeading(item.task.ideaHeading)} -->`
        const linkPart = item.sliceLink ? ` ${item.sliceLink}` : ''
        newLines.push(`- [ ] ${item.text}${linkPart}${sourceComment}`)
      }
      insertions.push({ lineNumber: insertLine, content: newLines })
    } else {
      // Find end of section to insert
      let endLine = insertLine + 1
      while (endLine < lines.length && !lines[endLine].startsWith('## ')) {
        endLine++
      }
      const newLines: string[] = []
      for (const item of futureTasksToAdd) {
        const sourceComment = ` <!-- from Ideas.md: ${cleanHeading(item.task.ideaHeading)} -->`
        const linkPart = item.sliceLink ? ` ${item.sliceLink}` : ''
        newLines.push(`- [ ] ${item.text}${linkPart}${sourceComment}`)
      }
      insertions.push({ lineNumber: endLine, content: newLines })
    }
  }

  // 2. Add to Active Tasks section
  if (activeTasksToAdd.length > 0) {
    let insertLine = structure.activeTasksLineNumber
    if (insertLine === -1) {
      // Create section (should not happen if Tasks.md is properly structured)
      insertLine = lines.length
      const newLines = ['', '## Active Tasks']
      for (const item of activeTasksToAdd) {
        const sourceComment = ` <!-- from Ideas.md: ${cleanHeading(item.task.ideaHeading)} -->`
        const linkPart = item.sliceLink ? ` ${item.sliceLink}` : ''
        newLines.push(`- [ ] ${item.text}${linkPart}${sourceComment}`)
      }
      insertions.push({ lineNumber: insertLine, content: newLines })
    } else {
      // Find end of section to insert
      let endLine = insertLine + 1
      while (endLine < lines.length && !lines[endLine].startsWith('## ') && !lines[endLine].startsWith('---')) {
        endLine++
      }
      const newLines: string[] = []
      for (const item of activeTasksToAdd) {
        const sourceComment = ` <!-- from Ideas.md: ${cleanHeading(item.task.ideaHeading)} -->`
        const linkPart = item.sliceLink ? ` ${item.sliceLink}` : ''
        newLines.push(`- [ ] ${item.text}${linkPart}${sourceComment}`)
      }
      insertions.push({ lineNumber: endLine, content: newLines })
    }
  }

  // 3. Add to Next 1-3 Actions
  if (nextActionsToAdd.length > 0 && structure.nextActionsLineNumber !== -1) {
    // Find end of Next Actions section
    let endLine = structure.nextActionsLineNumber + 1
    while (endLine < lines.length && !lines[endLine].startsWith('## ') && !lines[endLine].startsWith('---')) {
      endLine++
    }

    const newLines: string[] = []
    for (const item of nextActionsToAdd) {
      const linkPart = item.sliceLink ? ` ${item.sliceLink}` : ''
      newLines.push(`- [ ] ${item.text}${linkPart}`)
    }

    if (newLines.length > 0) {
      insertions.push({ lineNumber: endLine, content: newLines })
    }
  }

  // Apply insertions in reverse order to maintain line numbers
  insertions.sort((a, b) => b.lineNumber - a.lineNumber)
  for (const insertion of insertions) {
    lines.splice(insertion.lineNumber, 0, ...insertion.content)
  }

  return lines.join('\n')
}

/**
 * Clean up heading for use in source comment
 */
function cleanHeading(heading: string): string {
  // Remove ## prefix and trim
  return heading.replace(/^#+\s*/, '').trim()
}
