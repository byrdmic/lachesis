/**
 * Harvest Tasks Parser
 *
 * Types and utilities for the "Tasks: Harvest Tasks" workflow.
 * Handles parsing AI responses, Tasks.md structure, and applying user selections.
 *
 * NOTE: Vertical slices are defined in Roadmap.md, not Tasks.md.
 * Tasks link to slices using wiki links: [[Roadmap#VS1 — Slice Name]]
 */

import { extractJsonFromResponse } from './json-extractor'

// ============================================================================
// Constants
// ============================================================================

/** Emojis to denote where a task was moved */
export const HARVEST_MOVED_EMOJIS: Record<string, string> = {
  'discard': '🗑️',
  'later': '📋',
  'current': '✅',
}

// ============================================================================
// Types
// ============================================================================

/**
 * Where a harvested task should be placed in Tasks.md
 */
export type TaskDestination =
  | 'discard'
  | 'later'
  | 'current'

/**
 * A task suggestion from the AI harvest analysis.
 */
export interface HarvestedTask {
  id: string // Unique ID for UI tracking
  text: string // Task description
  sourceFile: string // Origin file (Log.md, Ideas.md, Overview.md, etc.)
  sourceContext: string | null // Brief quote or reference from source
  sourceDate: string | null // Date if from Log.md
  ideaHeading: string | null // Original ## heading if from Ideas.md (for context)
  suggestedDestination: TaskDestination
  suggestedSliceLink: string | null // AI-suggested slice link (e.g., "[[Roadmap#VS1 — Basic Modal Opens]]")
  reasoning: string | null // Why AI thinks this is actionable
  existingSimilar: string | null // If AI detected a similar existing task
  movedTo: TaskDestination | null // Where this task was moved (for history viewing)
}

/**
 * User's final decision for a harvested task
 */
export interface HarvestTaskSelection {
  taskId: string
  destination: TaskDestination
  sliceLink: string | null // Full wiki link like "[[Roadmap#VS1 — Slice Name]]" or null for standalone
  customText: string | null // User can edit the task text
}

/**
 * A vertical slice parsed from Roadmap.md
 */
export interface RoadmapSlice {
  id: string // VS1, VS2, etc.
  name: string // Slice Name
  milestone: string // M1, M2, etc.
  description: string | null // 1-2 sentence description
}

/**
 * Parsed structure of existing Tasks.md sections
 */
export interface ParsedTasksStructure {
  currentLineNumber: number // Where to insert current tasks
  laterLineNumber: number // Where to insert backlog tasks
}

/**
 * AI response format for harvest-tasks workflow
 */
export interface HarvestTasksAIResponse {
  tasks: Array<{
    text: string
    sourceFile: string
    sourceContext?: string
    sourceDate?: string
    ideaHeading?: string // Original ## heading if from Ideas.md
    suggestedDestination: TaskDestination
    suggestedSliceLink?: string
    reasoning?: string
    existingSimilar?: string
  }>
  summary: {
    totalFound: number
    fromLog: number
    fromIdeas: number
    fromOther: number
    duplicatesSkipped: number
  }
}

// ============================================================================
// Parsing Functions
// ============================================================================

/**
 * Check if a message contains harvest-tasks JSON response
 */
export function containsHarvestResponse(content: string): boolean {
  // Check for the distinctive JSON structure from harvest-tasks workflow
  return (
    content.includes('"sourceFile"') &&
    content.includes('"tasks"') &&
    content.includes('"suggestedDestination"') &&
    (content.includes('"fromLog"') || content.includes('"fromIdeas"'))
  )
}

/**
 * Parse AI JSON response into HarvestedTask array
 */
export function parseHarvestResponse(aiResponse: string): HarvestedTask[] {
  try {
    // Extract JSON from the response (handles code blocks with nested backticks)
    const jsonStr = extractJsonFromResponse(aiResponse)

    const parsed: HarvestTasksAIResponse = JSON.parse(jsonStr)

    if (!parsed.tasks || !Array.isArray(parsed.tasks)) {
      console.warn('Harvest response missing tasks array')
      return []
    }

    return parsed.tasks.map((task, index) => ({
      id: `harvest-${index}`,
      text: task.text,
      sourceFile: task.sourceFile,
      sourceContext: task.sourceContext || null,
      sourceDate: task.sourceDate || null,
      ideaHeading: task.ideaHeading || null,
      suggestedDestination: task.suggestedDestination || 'later',
      suggestedSliceLink: task.suggestedSliceLink || null,
      reasoning: task.reasoning || null,
      existingSimilar: task.existingSimilar || null,
      movedTo: null, // Will be populated when checking Tasks.md for history viewing
    }))
  } catch (error) {
    console.error('Failed to parse harvest response:', error)
    return []
  }
}

/**
 * Check Tasks.md content to determine which harvested tasks have been moved and where.
 * Updates the movedTo field on each task.
 */
export function detectMovedHarvestTasks(
  tasks: HarvestedTask[],
  tasksContent: string,
): HarvestedTask[] {
  const structure = parseTasksStructure(tasksContent)
  const lines = tasksContent.split('\n')

  // Build a map of section ranges
  const sectionRanges: Array<{ start: number; end: number; destination: TaskDestination }> = []

  // Current section
  if (structure.currentLineNumber !== -1) {
    let end = structure.currentLineNumber + 1
    while (end < lines.length && !lines[end].startsWith('## ') && !lines[end].startsWith('---')) {
      end++
    }
    sectionRanges.push({ start: structure.currentLineNumber, end, destination: 'current' })
  }

  // Later section
  if (structure.laterLineNumber !== -1) {
    let end = structure.laterLineNumber + 1
    while (end < lines.length && !lines[end].startsWith('## ')) {
      end++
    }
    sectionRanges.push({ start: structure.laterLineNumber, end, destination: 'later' })
  }

  // Find Discarded section
  const discardedSectionRegex = /^##\s*Discarded(?:\s+Tasks)?/i
  let discardedStart = -1
  let discardedEnd = -1
  for (let i = 0; i < lines.length; i++) {
    if (discardedSectionRegex.test(lines[i].trim())) {
      discardedStart = i
      discardedEnd = i + 1
      while (discardedEnd < lines.length && !lines[discardedEnd].startsWith('## ')) {
        discardedEnd++
      }
      break
    }
  }

  // Check each task to see if it was moved
  return tasks.map((task) => {
    // Look for the source comment pattern: <!-- from <sourceFile> --> or <!-- from <sourceFile> <date> -->
    // We need to match the task text AND the source file to be sure it's the same task
    const sourceFile = task.sourceFile
    const sourcePatternBase = `<!-- from ${sourceFile}`

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      // Check if line contains both the task text (or similar) and the source comment
      if (line.includes(sourcePatternBase)) {
        // Also verify the task text is similar (first few words)
        const taskWords = task.text.split(/\s+/).slice(0, 4).join(' ').toLowerCase()
        const lineText = line.toLowerCase()
        if (lineText.includes(taskWords.slice(0, 20))) {
          // Check if this is in the Discarded section (strikethrough format)
          if (discardedStart !== -1 && i >= discardedStart && i < discardedEnd) {
            return { ...task, movedTo: 'discard' }
          }

          // Found a match, determine which section it's in
          for (const range of sectionRanges) {
            if (i >= range.start && i < range.end) {
              return { ...task, movedTo: range.destination }
            }
          }
        }
      }
    }

    return task
  })
}

/**
 * Parse Tasks.md content to extract structure for destination options.
 * Supports both new section name (Current) and legacy names
 * (Now, Next, Next 1-3 Actions, Active Tasks) for backwards compatibility.
 */
export function parseTasksStructure(content: string): ParsedTasksStructure {
  const lines = content.split('\n')

  let currentLineNumber = -1
  let laterLineNumber = -1

  // Regex patterns - support both new and legacy section names
  // Current: "## Current" or legacy "## Now" or "## Next" or "## Next 1-3 Actions" or "## Active Tasks"
  const currentRegex = /^##\s*(?:Current|Now|Next(?:\s+1[–-]3\s+Actions)?|Active\s+Tasks)$/i
  // Later: "## Later" or legacy "## Future Tasks" or "## Potential Future Tasks"
  const laterRegex = /^##\s*(?:Later|Future\s+Tasks|Potential\s+Future\s+Tasks)/i

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    if (currentRegex.test(line)) {
      // Use the first match as the current section
      // (in case both Now and Next exist in legacy files, use the first one)
      if (currentLineNumber === -1) {
        currentLineNumber = i
      }
    } else if (laterRegex.test(line)) {
      laterLineNumber = i
    }
  }

  return {
    currentLineNumber,
    laterLineNumber,
  }
}

/**
 * Parse Roadmap.md content to extract vertical slices
 */
export function parseRoadmapSlices(content: string): RoadmapSlice[] {
  const slices: RoadmapSlice[] = []
  const lines = content.split('\n')

  let currentMilestone = ''
  let inSlicesSection = false

  // Regex patterns
  const milestoneSectionRegex = /^###\s*(M\d+)\s+Slices/i
  const sliceRegex = /^\s*-\s*\*\*(VS\d+)\s*[–-]\s*([^*]+)\*\*\s*:?\s*(.*)$/

  for (const line of lines) {
    // Check for "## Vertical Slices" section start
    if (/^##\s*Vertical\s+Slices/i.test(line)) {
      inSlicesSection = true
      continue
    }

    // Check for end of slices section (next ## heading)
    if (inSlicesSection && /^##\s+(?!Vertical\s+Slices)/i.test(line)) {
      inSlicesSection = false
      continue
    }

    if (!inSlicesSection) continue

    // Check for milestone subsection (### M1 Slices)
    const milestoneMatch = line.match(milestoneSectionRegex)
    if (milestoneMatch) {
      currentMilestone = milestoneMatch[1]
      continue
    }

    // Check for slice definition
    const sliceMatch = line.match(sliceRegex)
    if (sliceMatch) {
      slices.push({
        id: sliceMatch[1],
        name: sliceMatch[2].trim(),
        milestone: currentMilestone,
        description: sliceMatch[3]?.trim() || null,
      })
    }
  }

  return slices
}

// ============================================================================
// Apply Functions
// ============================================================================

/**
 * Apply user selections to Tasks.md content
 */
export function applyHarvestSelections(
  tasksContent: string,
  selections: HarvestTaskSelection[],
  tasks: HarvestedTask[],
): string {
  const lines = tasksContent.split('\n')
  const structure = parseTasksStructure(tasksContent)

  // Group selections by destination
  const laterToAdd: Array<{ text: string; task: HarvestedTask; sliceLink: string | null }> = []
  const currentToAdd: Array<{ text: string; task: HarvestedTask; sliceLink: string | null }> = []
  const discardedTasksToAdd: Array<{ text: string; task: HarvestedTask }> = []

  // Build a map of task IDs to tasks
  const taskMap = new Map(tasks.map((t) => [t.id, t]))

  for (const selection of selections) {
    const task = taskMap.get(selection.taskId)
    if (!task) continue

    const finalText = selection.customText || task.text
    const sliceLink = selection.sliceLink

    if (selection.destination === 'discard') {
      discardedTasksToAdd.push({ text: finalText, task })
      continue
    }

    switch (selection.destination) {
      case 'later':
        laterToAdd.push({ text: finalText, task, sliceLink })
        break

      case 'current':
        currentToAdd.push({ text: finalText, task, sliceLink })
        break
    }
  }

  // Track line insertions (we'll apply them in reverse order to maintain line numbers)
  const insertions: Array<{ lineNumber: number; content: string[] }> = []

  // 1. Add to Later section
  if (laterToAdd.length > 0) {
    let insertLine = structure.laterLineNumber
    if (insertLine === -1) {
      // Create section at end
      insertLine = lines.length
      const newLines = ['', '## Later']
      for (const item of laterToAdd) {
        const sourceComment = item.task.sourceDate
          ? ` <!-- from ${item.task.sourceFile} ${item.task.sourceDate} -->`
          : ` <!-- from ${item.task.sourceFile} -->`
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
      for (const item of laterToAdd) {
        const sourceComment = item.task.sourceDate
          ? ` <!-- from ${item.task.sourceFile} ${item.task.sourceDate} -->`
          : ` <!-- from ${item.task.sourceFile} -->`
        const linkPart = item.sliceLink ? ` ${item.sliceLink}` : ''
        newLines.push(`- [ ] ${item.text}${linkPart}${sourceComment}`)
      }
      insertions.push({ lineNumber: endLine, content: newLines })
    }
  }

  // 2. Add to Current section
  if (currentToAdd.length > 0) {
    let insertLine = structure.currentLineNumber
    if (insertLine === -1) {
      // Create section (should not happen if Tasks.md is properly structured)
      insertLine = lines.length
      const newLines = ['', '## Current']
      for (const item of currentToAdd) {
        const sourceComment = item.task.sourceDate
          ? ` <!-- from ${item.task.sourceFile} ${item.task.sourceDate} -->`
          : ` <!-- from ${item.task.sourceFile} -->`
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
      for (const item of currentToAdd) {
        const sourceComment = item.task.sourceDate
          ? ` <!-- from ${item.task.sourceFile} ${item.task.sourceDate} -->`
          : ` <!-- from ${item.task.sourceFile} -->`
        const linkPart = item.sliceLink ? ` ${item.sliceLink}` : ''
        newLines.push(`- [ ] ${item.text}${linkPart}${sourceComment}`)
      }
      insertions.push({ lineNumber: endLine, content: newLines })
    }
  }

  // 4. Add discarded tasks to Discarded section (with strikethrough)
  if (discardedTasksToAdd.length > 0) {
    // Find existing Discarded section or create at end
    const discardedSectionRegex = /^##\s*Discarded(?:\s+Tasks)?/i
    let discardedLineNumber = -1
    for (let i = 0; i < lines.length; i++) {
      if (discardedSectionRegex.test(lines[i].trim())) {
        discardedLineNumber = i
        break
      }
    }

    if (discardedLineNumber === -1) {
      // Create section at end of file
      const newLines = ['', '## Discarded']
      for (const item of discardedTasksToAdd) {
        const sourceComment = item.task.sourceDate
          ? ` <!-- from ${item.task.sourceFile} ${item.task.sourceDate} -->`
          : ` <!-- from ${item.task.sourceFile} -->`
        newLines.push(`- ~~${item.text}~~${sourceComment}`)
      }
      insertions.push({ lineNumber: lines.length, content: newLines })
    } else {
      // Find end of Discarded section to insert
      let endLine = discardedLineNumber + 1
      while (endLine < lines.length && !lines[endLine].startsWith('## ')) {
        endLine++
      }
      const newLines: string[] = []
      for (const item of discardedTasksToAdd) {
        const sourceComment = item.task.sourceDate
          ? ` <!-- from ${item.task.sourceFile} ${item.task.sourceDate} -->`
          : ` <!-- from ${item.task.sourceFile} -->`
        newLines.push(`- ~~${item.text}~~${sourceComment}`)
      }
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

// ============================================================================
// Summary Extraction
// ============================================================================

/**
 * Summary info extracted from a harvest-tasks response
 */
export interface HarvestTasksSummary {
  totalFound: number
  fromLog: number
  fromIdeas: number
  fromOther: number
  duplicatesSkipped: number
}

/**
 * Extract summary info from a harvest-tasks JSON response
 */
export function extractHarvestTasksSummary(content: string): HarvestTasksSummary | null {
  try {
    // Use the same robust extraction logic
    const jsonStr = extractJsonFromResponse(content)

    const parsed = JSON.parse(jsonStr)

    if (parsed.summary) {
      return {
        totalFound: parsed.summary.totalFound ?? 0,
        fromLog: parsed.summary.fromLog ?? 0,
        fromIdeas: parsed.summary.fromIdeas ?? 0,
        fromOther: parsed.summary.fromOther ?? 0,
        duplicatesSkipped: parsed.summary.duplicatesSkipped ?? 0,
      }
    }

    // Fallback: count tasks if no summary provided
    if (parsed.tasks && Array.isArray(parsed.tasks)) {
      const tasks = parsed.tasks as Array<{ sourceFile?: string }>
      const fromLog = tasks.filter(t => t.sourceFile?.toLowerCase().includes('log')).length
      const fromIdeas = tasks.filter(t => t.sourceFile?.toLowerCase().includes('ideas')).length
      return {
        totalFound: tasks.length,
        fromLog,
        fromIdeas,
        fromOther: tasks.length - fromLog - fromIdeas,
        duplicatesSkipped: 0,
      }
    }

    return null
  } catch {
    return null
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get a human-readable label for a destination
 */
export function getDestinationLabel(destination: TaskDestination): string {
  switch (destination) {
    case 'discard':
      return 'Discard'
    case 'later':
      return 'Later'
    case 'current':
      return 'Current'
  }
}

/**
 * Check if a destination can have a slice link
 */
export function destinationSupportsSliceLink(destination: TaskDestination): boolean {
  return destination === 'current' || destination === 'later'
}

/**
 * Format a slice as a wiki link
 */
export function formatSliceLink(slice: RoadmapSlice): string {
  return `[[Roadmap#${slice.id} — ${slice.name}]]`
}

/**
 * Get display text for a slice (for dropdowns)
 */
export function formatSliceDisplay(slice: RoadmapSlice): string {
  return `${slice.id} — ${slice.name}${slice.milestone ? ` (${slice.milestone})` : ''}`
}
