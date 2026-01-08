/**
 * Harvest Tasks Parser
 *
 * Types and utilities for the "Tasks: Harvest Tasks" workflow.
 * Handles parsing AI responses, Tasks.md structure, and applying user selections.
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
  | 'active-vs'
  | 'next-actions'
  | 'new-planned-slice'
  | 'existing-planned-slice'

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
  suggestedVSName: string | null // AI-suggested VS name if destination is 'new-planned-slice'
  reasoning: string | null // Why AI thinks this is actionable
  existingSimilar: string | null // If AI detected a similar existing task
}

/**
 * User's final decision for a harvested task
 */
export interface HarvestTaskSelection {
  taskId: string
  destination: TaskDestination
  targetVS: string | null // VS# for active-vs, or slice name for planned
  sliceName: string | null // Name for new planned slice
  customText: string | null // User can edit the task text
}

/**
 * An active vertical slice parsed from Tasks.md
 */
export interface ActiveSlice {
  id: string // VS1, VS2, etc.
  name: string // Slice Name
  taskCount: number
  lastTaskNumber: number // For generating next task ID
  lineNumber: number // Line where the slice header starts
}

/**
 * A planned slice parsed from Tasks.md
 */
export interface PlannedSlice {
  id: string // PS1, PS2, etc.
  name: string
  brief: string | null
  lineNumber: number
}

/**
 * Parsed structure of existing Tasks.md sections
 */
export interface ParsedTasksStructure {
  nextActionsLineNumber: number // Where to insert new next actions
  activeSlices: ActiveSlice[]
  plannedSlices: PlannedSlice[]
  futureTasksLineNumber: number // Where to insert new future tasks
  plannedSlicesSectionLineNumber: number // Where the Planned Slices section starts (-1 if not found)
  hasPlannedSlicesSection: boolean
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
    suggestedVSName?: string
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
      suggestedVSName: task.suggestedVSName || null,
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
  let futureTasksLineNumber = -1
  let plannedSlicesSectionLineNumber = -1
  const activeSlices: ActiveSlice[] = []
  const plannedSlices: PlannedSlice[] = []

  // Regex patterns
  const nextActionsRegex = /^##\s*Next\s+1[–-]3\s+Actions/i
  const futureTasksRegex = /^##\s*(?:Future\s+Tasks|Potential\s+Future\s+Tasks)/i
  const plannedSlicesRegex = /^##\s*Planned\s+Slices/i
  const activeSliceRegex = /^###\s*(VS\d+)\s*[–-]\s*(.+)$/
  const plannedSliceRegex = /^###\s*(PS\d+)\s*[–-]\s*(.+)$/
  const taskLineRegex = /^-\s*\[[ x]\]\s*(VS\d+-T(\d+))/i

  let currentActiveSlice: ActiveSlice | null = null
  let inActiveSlicesSection = false
  let inPlannedSlicesSection = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    // Check for Next Actions section
    if (nextActionsRegex.test(line)) {
      nextActionsLineNumber = i
      inActiveSlicesSection = false
      inPlannedSlicesSection = false
      continue
    }

    // Check for Active Vertical Slices section
    if (/^##\s*Active\s+Vertical\s+Slices/i.test(line)) {
      inActiveSlicesSection = true
      inPlannedSlicesSection = false
      continue
    }

    // Check for Planned Slices section
    if (plannedSlicesRegex.test(line)) {
      plannedSlicesSectionLineNumber = i
      inActiveSlicesSection = false
      inPlannedSlicesSection = true
      continue
    }

    // Check for Future Tasks section
    if (futureTasksRegex.test(line)) {
      futureTasksLineNumber = i
      inActiveSlicesSection = false
      inPlannedSlicesSection = false
      continue
    }

    // Check for other ## sections (ends current context)
    if (line.startsWith('## ')) {
      inActiveSlicesSection = false
      inPlannedSlicesSection = false
      continue
    }

    // Parse active slice headers
    if (inActiveSlicesSection) {
      const sliceMatch = line.match(activeSliceRegex)
      if (sliceMatch) {
        // Save previous slice if exists
        if (currentActiveSlice) {
          activeSlices.push(currentActiveSlice)
        }
        currentActiveSlice = {
          id: sliceMatch[1],
          name: sliceMatch[2].trim(),
          taskCount: 0,
          lastTaskNumber: 0,
          lineNumber: i,
        }
        continue
      }

      // Count tasks in current slice
      if (currentActiveSlice) {
        const taskMatch = line.match(taskLineRegex)
        if (taskMatch) {
          currentActiveSlice.taskCount++
          const taskNum = parseInt(taskMatch[2], 10)
          if (taskNum > currentActiveSlice.lastTaskNumber) {
            currentActiveSlice.lastTaskNumber = taskNum
          }
        }
      }
    }

    // Parse planned slice headers
    if (inPlannedSlicesSection) {
      const sliceMatch = line.match(plannedSliceRegex)
      if (sliceMatch) {
        plannedSlices.push({
          id: sliceMatch[1],
          name: sliceMatch[2].trim(),
          brief: null, // Could parse the brief if needed
          lineNumber: i,
        })
      }
    }
  }

  // Don't forget the last active slice
  if (currentActiveSlice) {
    activeSlices.push(currentActiveSlice)
  }

  return {
    nextActionsLineNumber,
    activeSlices,
    plannedSlices,
    futureTasksLineNumber,
    plannedSlicesSectionLineNumber,
    hasPlannedSlicesSection: plannedSlicesSectionLineNumber !== -1,
  }
}

/**
 * Get the next task number for a given slice
 */
function getNextTaskId(sliceId: string, lastTaskNumber: number): string {
  return `${sliceId}-T${lastTaskNumber + 1}`
}

/**
 * Get the next planned slice ID
 */
function getNextPlannedSliceId(existingSlices: PlannedSlice[]): string {
  if (existingSlices.length === 0) return 'PS1'
  const maxNum = Math.max(...existingSlices.map((s) => parseInt(s.id.replace('PS', ''), 10) || 0))
  return `PS${maxNum + 1}`
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
  const futureTasksToAdd: Array<{ text: string; task: HarvestedTask }> = []
  const nextActionsToAdd: Array<{ text: string; task: HarvestedTask; targetVS: string }> = []
  const activeVSTasksToAdd: Map<string, Array<{ text: string; task: HarvestedTask }>> = new Map()
  const newPlannedSlicesToAdd: Array<{ name: string; task: HarvestedTask }> = []
  const existingPlannedSlicesToAdd: Map<string, Array<{ text: string; task: HarvestedTask }>> = new Map()

  // Build a map of task IDs to tasks
  const taskMap = new Map(tasks.map((t) => [t.id, t]))

  for (const selection of selections) {
    if (selection.destination === 'discard') continue

    const task = taskMap.get(selection.taskId)
    if (!task) continue

    const finalText = selection.customText || task.text

    switch (selection.destination) {
      case 'future-tasks':
        futureTasksToAdd.push({ text: finalText, task })
        break

      case 'next-actions':
        if (selection.targetVS) {
          nextActionsToAdd.push({ text: finalText, task, targetVS: selection.targetVS })
        }
        break

      case 'active-vs':
        if (selection.targetVS) {
          if (!activeVSTasksToAdd.has(selection.targetVS)) {
            activeVSTasksToAdd.set(selection.targetVS, [])
          }
          activeVSTasksToAdd.get(selection.targetVS)!.push({ text: finalText, task })
        }
        break

      case 'new-planned-slice':
        if (selection.sliceName) {
          newPlannedSlicesToAdd.push({ name: selection.sliceName, task })
        }
        break

      case 'existing-planned-slice':
        if (selection.targetVS) {
          if (!existingPlannedSlicesToAdd.has(selection.targetVS)) {
            existingPlannedSlicesToAdd.set(selection.targetVS, [])
          }
          existingPlannedSlicesToAdd.get(selection.targetVS)!.push({ text: finalText, task })
        }
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
        newLines.push(`- [ ] ${item.text}${sourceComment}`)
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
        newLines.push(`- [ ] ${item.text}${sourceComment}`)
      }
      insertions.push({ lineNumber: endLine, content: newLines })
    }
  }

  // 2. Add tasks to Active VS + update lastTaskNumber tracking
  const vsTaskNumbers = new Map<string, number>()
  for (const slice of structure.activeSlices) {
    vsTaskNumbers.set(slice.id, slice.lastTaskNumber)
  }

  for (const [vsId, tasksToAdd] of activeVSTasksToAdd) {
    const slice = structure.activeSlices.find((s) => s.id === vsId)
    if (!slice) continue

    // Find where to insert (after **Tasks** line or at end of slice)
    let insertLine = slice.lineNumber + 1
    let foundTasksHeader = false
    while (insertLine < lines.length && !lines[insertLine].startsWith('### ') && !lines[insertLine].startsWith('## ')) {
      if (lines[insertLine].includes('**Tasks**')) {
        foundTasksHeader = true
      }
      // Find the last task line in this slice
      if (foundTasksHeader && lines[insertLine].match(/^-\s*\[[ x]\]/)) {
        // Keep going to find the last task
      }
      insertLine++
    }

    const newLines: string[] = []
    for (const item of tasksToAdd) {
      const currentNum = vsTaskNumbers.get(vsId) || 0
      const newTaskId = getNextTaskId(vsId, currentNum)
      vsTaskNumbers.set(vsId, currentNum + 1)

      const sourceComment = item.task.sourceDate
        ? ` <!-- from ${item.task.sourceFile} ${item.task.sourceDate} -->`
        : ` <!-- from ${item.task.sourceFile} -->`
      newLines.push(`- [ ] ${newTaskId} ${item.text} ^${newTaskId}${sourceComment}`)
    }

    if (newLines.length > 0) {
      insertions.push({ lineNumber: insertLine, content: newLines })
    }
  }

  // 3. Add to Next 1-3 Actions
  if (nextActionsToAdd.length > 0 && structure.nextActionsLineNumber !== -1) {
    // Find end of Next Actions section
    let endLine = structure.nextActionsLineNumber + 1
    while (endLine < lines.length && !lines[endLine].startsWith('## ')) {
      endLine++
    }

    const newLines: string[] = []
    for (const item of nextActionsToAdd) {
      // Get the task ID we assigned (or will assign) for this task
      const currentNum = vsTaskNumbers.get(item.targetVS) || 0
      const taskId = getNextTaskId(item.targetVS, currentNum)
      vsTaskNumbers.set(item.targetVS, currentNum + 1)

      newLines.push(`- [[#^${taskId}|${taskId}]] ${item.text}`)
    }

    if (newLines.length > 0) {
      insertions.push({ lineNumber: endLine, content: newLines })
    }
  }

  // 4. Add new Planned Slices
  if (newPlannedSlicesToAdd.length > 0) {
    let nextPSNum =
      structure.plannedSlices.length > 0
        ? Math.max(...structure.plannedSlices.map((s) => parseInt(s.id.replace('PS', ''), 10) || 0)) + 1
        : 1

    const newLines: string[] = []

    // Create section if it doesn't exist
    if (!structure.hasPlannedSlicesSection) {
      newLines.push('')
      newLines.push('## Planned Slices (queued for activation)')
      newLines.push('<!-- Vertical slices identified but not yet active -->')
      newLines.push('<!-- When ready to start, move to Active Vertical Slices and expand tasks -->')
      newLines.push('')
    }

    for (const item of newPlannedSlicesToAdd) {
      const psId = `PS${nextPSNum++}`
      newLines.push(`### ${psId} — ${item.name}`)
      newLines.push(`**Brief:** ${item.task.text}`)
      newLines.push(`**Why queued:** Identified from ${item.task.sourceFile}`)
      newLines.push('')
    }

    // Insert at end of Planned Slices section or at end of file
    const insertLine = structure.hasPlannedSlicesSection
      ? findSectionEnd(lines, structure.plannedSlicesSectionLineNumber)
      : lines.length

    insertions.push({ lineNumber: insertLine, content: newLines })
  }

  // Apply insertions in reverse order to maintain line numbers
  insertions.sort((a, b) => b.lineNumber - a.lineNumber)
  for (const insertion of insertions) {
    lines.splice(insertion.lineNumber, 0, ...insertion.content)
  }

  return lines.join('\n')
}

/**
 * Find the end of a section (next ## header or end of file)
 */
function findSectionEnd(lines: string[], sectionStart: number): number {
  for (let i = sectionStart + 1; i < lines.length; i++) {
    if (lines[i].startsWith('## ')) {
      return i
    }
  }
  return lines.length
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
    case 'active-vs':
      return 'Active Vertical Slice'
    case 'next-actions':
      return 'Next 1-3 Actions'
    case 'new-planned-slice':
      return 'New Planned Slice'
    case 'existing-planned-slice':
      return 'Existing Planned Slice'
  }
}

/**
 * Check if a destination requires a target VS selection
 */
export function destinationRequiresTarget(destination: TaskDestination): boolean {
  return destination === 'active-vs' || destination === 'next-actions' || destination === 'existing-planned-slice'
}

/**
 * Check if a destination requires a slice name input
 */
export function destinationRequiresSliceName(destination: TaskDestination): boolean {
  return destination === 'new-planned-slice'
}
