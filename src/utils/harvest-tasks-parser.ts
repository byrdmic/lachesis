/**
 * Harvest Tasks Parser
 *
 * Types and utilities for the "Tasks: Harvest Tasks" workflow.
 * Handles parsing AI responses, Tasks.md structure, and applying user selections.
 *
 * NOTE: Vertical slices are defined in Roadmap.md, not Tasks.md.
 * Tasks link to slices using wiki links: [[Roadmap#VS1 — Slice Name]]
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Where a harvested task should be placed in Tasks.md
 */
export type TaskDestination =
  | 'discard'
  | 'future-tasks'
  | 'active-tasks'
  | 'next-actions'

/**
 * A task suggestion from the AI harvest analysis.
 */
export interface HarvestedTask {
  id: string // Unique ID for UI tracking
  text: string // Task description
  sourceFile: string // Origin file (Log.md, Ideas.md, Overview.md, etc.)
  sourceContext: string | null // Brief quote or reference from source
  sourceDate: string | null // Date if from Log.md
  suggestedDestination: TaskDestination
  suggestedSliceLink: string | null // AI-suggested slice link (e.g., "[[Roadmap#VS1 — Basic Modal Opens]]")
  reasoning: string | null // Why AI thinks this is actionable
  existingSimilar: string | null // If AI detected a similar existing task
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
  nextActionsLineNumber: number // Where to insert new next actions
  activeTasksLineNumber: number // Where to insert new active tasks
  futureTasksLineNumber: number // Where to insert new future tasks
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
 * Parse AI JSON response into HarvestedTask array
 */
export function parseHarvestResponse(aiResponse: string): HarvestedTask[] {
  try {
    // Extract JSON from the response (it might be wrapped in markdown code blocks)
    let jsonStr = aiResponse.trim()

    // Try to extract JSON from code blocks
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim()
    }

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
      suggestedDestination: task.suggestedDestination || 'future-tasks',
      suggestedSliceLink: task.suggestedSliceLink || null,
      reasoning: task.reasoning || null,
      existingSimilar: task.existingSimilar || null,
    }))
  } catch (error) {
    console.error('Failed to parse harvest response:', error)
    return []
  }
}

/**
 * Parse Tasks.md content to extract structure for destination options
 */
export function parseTasksStructure(content: string): ParsedTasksStructure {
  const lines = content.split('\n')

  let nextActionsLineNumber = -1
  let activeTasksLineNumber = -1
  let futureTasksLineNumber = -1

  // Regex patterns
  const nextActionsRegex = /^##\s*Next\s+1[–-]3\s+Actions/i
  const activeTasksRegex = /^##\s*Active\s+Tasks/i
  const futureTasksRegex = /^##\s*(?:Future\s+Tasks|Potential\s+Future\s+Tasks)/i

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    if (nextActionsRegex.test(line)) {
      nextActionsLineNumber = i
    } else if (activeTasksRegex.test(line)) {
      activeTasksLineNumber = i
    } else if (futureTasksRegex.test(line)) {
      futureTasksLineNumber = i
    }
  }

  return {
    nextActionsLineNumber,
    activeTasksLineNumber,
    futureTasksLineNumber,
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
  const futureTasksToAdd: Array<{ text: string; task: HarvestedTask; sliceLink: string | null }> = []
  const activeTasksToAdd: Array<{ text: string; task: HarvestedTask; sliceLink: string | null }> = []
  const nextActionsToAdd: Array<{ text: string; task: HarvestedTask; sliceLink: string | null }> = []

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
      for (const item of futureTasksToAdd) {
        const sourceComment = item.task.sourceDate
          ? ` <!-- from ${item.task.sourceFile} ${item.task.sourceDate} -->`
          : ` <!-- from ${item.task.sourceFile} -->`
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
      for (const item of activeTasksToAdd) {
        const sourceComment = item.task.sourceDate
          ? ` <!-- from ${item.task.sourceFile} ${item.task.sourceDate} -->`
          : ` <!-- from ${item.task.sourceFile} -->`
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
    case 'future-tasks':
      return 'Future Tasks'
    case 'active-tasks':
      return 'Active Tasks'
    case 'next-actions':
      return 'Next 1-3 Actions'
  }
}

/**
 * Check if a destination can have a slice link
 */
export function destinationSupportsSliceLink(destination: TaskDestination): boolean {
  return destination === 'active-tasks' || destination === 'next-actions' || destination === 'future-tasks'
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
