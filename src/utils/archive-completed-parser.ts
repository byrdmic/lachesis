/**
 * Archive Completed Parser
 *
 * Types and utilities for the "Tasks: Archive Completed" workflow.
 * Handles parsing completed tasks from Tasks.md, grouping by vertical slice,
 * and applying archive operations to both Tasks.md and Archive.md.
 */

// ============================================================================
// Constants
// ============================================================================

/** Action labels for display */
export const ARCHIVE_ACTION_LABELS: Record<ArchiveAction, string> = {
  archive: 'Archive',
  keep: 'Keep in Tasks',
}

/** Pattern to extract slice reference from a task line */
const SLICE_REF_PATTERN = /\[\[Roadmap#(VS\d+\s*[—–-]\s*.+?)\]\]/

/** Pattern to detect a completed task */
const COMPLETED_TASK_PATTERN = /^\s*-\s*\[x\]\s+(.+)$/i

// ============================================================================
// Types
// ============================================================================

/**
 * Action the user can take for each completed task
 */
export type ArchiveAction = 'archive' | 'keep'

/**
 * A completed task extracted from Tasks.md
 */
export interface CompletedTask {
  id: string // Unique ID for UI tracking
  text: string // Task description (without the checkbox)
  fullLine: string // Complete line including checkbox and slice ref
  lineNumber: number // Line number in Tasks.md (0-indexed)
  sliceRef: string | null // Full slice reference e.g., "VS1 — Core Interview Flow"
  sliceName: string | null // Just the slice name e.g., "Core Interview Flow"
  section: TaskSection // Which section the task is in
  subItems: string[] // Any indented sub-items (acceptance criteria, notes)
}

/**
 * Task section in Tasks.md
 */
export type TaskSection =
  | 'now'
  | 'next'
  | 'blocked'
  | 'later'
  | 'done'
  | 'unknown'

/**
 * A group of tasks belonging to the same slice
 */
export interface SliceGroup {
  sliceRef: string // Full slice reference e.g., "VS1 — Core Interview Flow"
  sliceName: string // Just the name part after the dash
  tasks: CompletedTask[]
  summary?: string // AI-generated summary of what was completed
}

/**
 * User's selection for a completed task
 */
export interface ArchiveSelection {
  taskId: string
  action: ArchiveAction
}

/**
 * AI response format for archive-completed workflow
 */
export interface ArchiveCompletedAIResponse {
  groups: Array<{
    sliceRef: string
    sliceName: string
    tasks: Array<{
      text: string
      fullLine: string
      lineNumber: number
    }>
    summary?: string
  }>
  standaloneTasks: Array<{
    text: string
    fullLine: string
    lineNumber: number
  }>
  summary: {
    totalCompleted: number
    sliceCount: number
    standaloneCount: number
  }
}

/**
 * Parsed result combining local parsing with AI enrichment
 */
export interface ParsedArchiveCompletedResult {
  sliceGroups: SliceGroup[]
  standaloneTasks: CompletedTask[]
  summary: {
    totalCompleted: number
    sliceCount: number
    standaloneCount: number
  }
}

/**
 * Summary data for display purposes
 */
export interface ArchiveCompletedSummary {
  totalCompleted: number
  sliceCount: number
  standaloneCount: number
  sliceNames: string[]
}

// ============================================================================
// Parsing Functions
// ============================================================================

/**
 * Extract all completed tasks from Tasks.md content
 */
export function extractCompletedTasks(tasksContent: string): CompletedTask[] {
  const lines = tasksContent.split('\n')
  const tasks: CompletedTask[] = []
  let currentSection: TaskSection = 'unknown'
  let taskIndex = 0

  // Section detection patterns - support both new and legacy section names
  const sectionPatterns: Array<{ pattern: RegExp; section: TaskSection }> = [
    { pattern: /^##\s*(?:Now|Next\s+1[–-]3\s+Actions)/i, section: 'now' },
    { pattern: /^##\s*(?:Next|Active\s+Tasks)$/i, section: 'next' },
    { pattern: /^##\s*Blocked/i, section: 'blocked' },
    { pattern: /^##\s*(?:Later|Future\s+Tasks|Potential\s+Future\s+Tasks)/i, section: 'later' },
    { pattern: /^##\s*(?:Done|Recently\s+Completed)/i, section: 'done' },
  ]

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Update current section if we hit a section header
    for (const { pattern, section } of sectionPatterns) {
      if (pattern.test(line)) {
        currentSection = section
        break
      }
    }

    // Check for completed task
    const taskMatch = line.match(COMPLETED_TASK_PATTERN)
    if (taskMatch) {
      const fullLine = line.trim()
      const text = taskMatch[1].trim()

      // Extract slice reference if present
      const sliceMatch = fullLine.match(SLICE_REF_PATTERN)
      let sliceRef: string | null = null
      let sliceName: string | null = null

      if (sliceMatch) {
        sliceRef = sliceMatch[1]
        // Extract just the name part (after "VS1 — ")
        const nameMatch = sliceRef.match(/VS\d+\s*[—–-]\s*(.+)/)
        sliceName = nameMatch ? nameMatch[1].trim() : sliceRef
      }

      // Collect sub-items (indented lines following the task)
      const subItems: string[] = []
      let j = i + 1
      while (j < lines.length) {
        const nextLine = lines[j]
        // Check if line is indented (starts with spaces/tabs after trimming would reduce length)
        if (nextLine.match(/^\s{2,}/) && !nextLine.match(/^\s*-\s*\[/)) {
          subItems.push(nextLine)
          j++
        } else {
          break
        }
      }

      tasks.push({
        id: `archive-${taskIndex}`,
        text: text.replace(SLICE_REF_PATTERN, '').trim(), // Remove slice ref from text
        fullLine,
        lineNumber: i,
        sliceRef,
        sliceName,
        section: currentSection,
        subItems,
      })

      taskIndex++
    }
  }

  return tasks
}

/**
 * Group completed tasks by their slice reference
 */
export function groupTasksBySlice(tasks: CompletedTask[]): {
  sliceGroups: SliceGroup[]
  standaloneTasks: CompletedTask[]
} {
  const sliceMap = new Map<string, CompletedTask[]>()
  const standaloneTasks: CompletedTask[] = []

  for (const task of tasks) {
    if (task.sliceRef) {
      const existing = sliceMap.get(task.sliceRef) || []
      existing.push(task)
      sliceMap.set(task.sliceRef, existing)
    } else {
      standaloneTasks.push(task)
    }
  }

  const sliceGroups: SliceGroup[] = []
  for (const [sliceRef, groupTasks] of sliceMap.entries()) {
    // Extract slice name from ref
    const nameMatch = sliceRef.match(/VS\d+\s*[—–-]\s*(.+)/)
    const sliceName = nameMatch ? nameMatch[1].trim() : sliceRef

    sliceGroups.push({
      sliceRef,
      sliceName,
      tasks: groupTasks,
    })
  }

  // Sort groups by VS number
  sliceGroups.sort((a, b) => {
    const aNum = parseInt(a.sliceRef.match(/VS(\d+)/)?.[1] || '0')
    const bNum = parseInt(b.sliceRef.match(/VS(\d+)/)?.[1] || '0')
    return aNum - bNum
  })

  return { sliceGroups, standaloneTasks }
}

/**
 * Check if a message contains archive-completed JSON response
 */
export function containsArchiveCompletedResponse(content: string): boolean {
  return (
    content.includes('"groups"') &&
    content.includes('"standaloneTasks"') &&
    content.includes('"totalCompleted"')
  )
}

/**
 * Extract summary information from archive-completed response for display
 */
export function extractArchiveCompletedSummary(content: string): ArchiveCompletedSummary | null {
  try {
    let jsonStr = content.trim()
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim()
    }

    const parsed = JSON.parse(jsonStr) as ArchiveCompletedAIResponse

    if (!parsed.groups || !Array.isArray(parsed.groups)) {
      return null
    }

    return {
      totalCompleted: parsed.summary?.totalCompleted || 0,
      sliceCount: parsed.groups.length,
      standaloneCount: parsed.standaloneTasks?.length || 0,
      sliceNames: parsed.groups.map((g) => g.sliceName),
    }
  } catch {
    return null
  }
}

/**
 * Parse AI JSON response and merge with locally extracted tasks
 */
export function parseArchiveCompletedResponse(
  aiResponse: string,
  localTasks: CompletedTask[],
): ParsedArchiveCompletedResult {
  try {
    let jsonStr = aiResponse.trim()
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim()
    }

    const parsed = JSON.parse(jsonStr) as ArchiveCompletedAIResponse

    // Build a map of local tasks by line number for lookup
    const tasksByLine = new Map(localTasks.map((t) => [t.lineNumber, t]))

    // Merge AI response with local task data
    const sliceGroups: SliceGroup[] = parsed.groups.map((group) => ({
      sliceRef: group.sliceRef,
      sliceName: group.sliceName,
      tasks: group.tasks.map((t) => tasksByLine.get(t.lineNumber)).filter((t): t is CompletedTask => t !== undefined),
      summary: group.summary,
    }))

    const standaloneTasks = parsed.standaloneTasks
      .map((t) => tasksByLine.get(t.lineNumber))
      .filter((t): t is CompletedTask => t !== undefined)

    return {
      sliceGroups,
      standaloneTasks,
      summary: parsed.summary || {
        totalCompleted: localTasks.length,
        sliceCount: sliceGroups.length,
        standaloneCount: standaloneTasks.length,
      },
    }
  } catch (error) {
    console.error('Failed to parse archive completed response:', error)
    // Fall back to local grouping
    const { sliceGroups, standaloneTasks } = groupTasksBySlice(localTasks)
    return {
      sliceGroups,
      standaloneTasks,
      summary: {
        totalCompleted: localTasks.length,
        sliceCount: sliceGroups.length,
        standaloneCount: standaloneTasks.length,
      },
    }
  }
}

// ============================================================================
// Apply Functions
// ============================================================================

/**
 * Remove archived tasks from Tasks.md content
 * Returns the modified content with archived tasks removed
 */
export function applyArchiveRemoval(
  tasksContent: string,
  selections: ArchiveSelection[],
  tasks: CompletedTask[],
): string {
  const lines = tasksContent.split('\n')
  const taskMap = new Map(tasks.map((t) => [t.id, t]))

  // Get line numbers of tasks to remove (sorted descending to remove from bottom up)
  const linesToRemove = new Set<number>()

  for (const selection of selections) {
    if (selection.action === 'archive') {
      const task = taskMap.get(selection.taskId)
      if (task) {
        // Add the task line
        linesToRemove.add(task.lineNumber)
        // Add any sub-item lines
        for (let i = 0; i < task.subItems.length; i++) {
          linesToRemove.add(task.lineNumber + 1 + i)
        }
      }
    }
  }

  // Filter out the lines to remove
  const newLines = lines.filter((_, index) => !linesToRemove.has(index))

  return newLines.join('\n')
}

/**
 * Format a task for archiving (preserves full line including slice ref and sub-items)
 */
function formatTaskForArchive(task: CompletedTask): string {
  const lines = [task.fullLine]
  for (const subItem of task.subItems) {
    lines.push(subItem)
  }
  return lines.join('\n')
}

/**
 * Build archive entries organized by slice
 * Returns a map of slice heading -> array of formatted task lines
 */
export function buildArchiveEntries(
  selections: ArchiveSelection[],
  sliceGroups: SliceGroup[],
  standaloneTasks: CompletedTask[],
): Map<string, string[]> {
  const entries = new Map<string, string[]>()
  const taskMap = new Map<string, CompletedTask>()

  // Build task lookup
  for (const group of sliceGroups) {
    for (const task of group.tasks) {
      taskMap.set(task.id, task)
    }
  }
  for (const task of standaloneTasks) {
    taskMap.set(task.id, task)
  }

  // Group selections by slice
  for (const selection of selections) {
    if (selection.action !== 'archive') continue

    const task = taskMap.get(selection.taskId)
    if (!task) continue

    const heading = task.sliceRef ? `### ${task.sliceRef}` : '### Completed Tasks'
    const existing = entries.get(heading) || []
    existing.push(formatTaskForArchive(task))
    entries.set(heading, existing)
  }

  return entries
}

/**
 * Apply archive entries to Archive.md content
 * Accumulates tasks under existing slice headings or creates new ones
 */
export function applyArchiveAdditions(
  archiveContent: string,
  entries: Map<string, string[]>,
): string {
  if (entries.size === 0) return archiveContent

  const lines = archiveContent.split('\n')
  const today = new Date().toISOString().split('T')[0]

  // Find the "## Completed Work" section
  let completedWorkIndex = -1
  let completedWorkEndIndex = lines.length

  for (let i = 0; i < lines.length; i++) {
    if (/^##\s*Completed\s+Work/i.test(lines[i])) {
      completedWorkIndex = i
      // Find end of section (next ## heading)
      for (let j = i + 1; j < lines.length; j++) {
        if (/^##\s+/.test(lines[j])) {
          completedWorkEndIndex = j
          break
        }
      }
      break
    }
  }

  // If no "Completed Work" section, create one after frontmatter
  if (completedWorkIndex === -1) {
    let afterFrontmatter = 0
    if (lines[0] === '---') {
      for (let i = 1; i < lines.length; i++) {
        if (lines[i] === '---') {
          afterFrontmatter = i + 1
          break
        }
      }
    }

    // Insert the section header
    lines.splice(afterFrontmatter, 0, '', '## Completed Work', '')
    completedWorkIndex = afterFrontmatter + 1
    completedWorkEndIndex = afterFrontmatter + 3
  }

  // Process each slice's entries
  for (const [heading, taskLines] of entries) {
    // Check if this heading already exists in Completed Work section
    let existingHeadingIndex = -1

    for (let i = completedWorkIndex + 1; i < completedWorkEndIndex; i++) {
      // Match the heading (### VS1 — Slice Name)
      if (lines[i].trim() === heading.trim()) {
        existingHeadingIndex = i
        break
      }
    }

    if (existingHeadingIndex !== -1) {
      // Find the end of this subsection (next ### or ## or end of section)
      let insertIndex = existingHeadingIndex + 1

      // Skip any blank lines after heading
      while (insertIndex < completedWorkEndIndex && lines[insertIndex].trim() === '') {
        insertIndex++
      }

      // Find where to insert (after existing content under this heading)
      while (
        insertIndex < completedWorkEndIndex &&
        !lines[insertIndex].startsWith('###') &&
        !lines[insertIndex].startsWith('##')
      ) {
        insertIndex++
      }

      // Insert the new tasks before the next heading
      const insertContent = taskLines.join('\n')
      lines.splice(insertIndex, 0, insertContent)

      // Adjust end index since we added lines
      completedWorkEndIndex += taskLines.length
    } else {
      // Create new heading under Completed Work
      // Find where to insert (right after Completed Work heading and any intro text)
      let insertIndex = completedWorkIndex + 1

      // Skip blank lines
      while (insertIndex < completedWorkEndIndex && lines[insertIndex].trim() === '') {
        insertIndex++
      }

      // Insert the new heading and tasks
      const insertContent = ['', heading, ...taskLines, '']
      lines.splice(insertIndex, 0, ...insertContent)

      // Adjust end index
      completedWorkEndIndex += insertContent.length
    }
  }

  return lines.join('\n')
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get default action for a completed task
 * Default is to archive since these are already completed
 */
export function getDefaultArchiveAction(): ArchiveAction {
  return 'archive'
}

/**
 * Get a human-readable label for a task section
 */
export function getTaskSectionLabel(section: TaskSection): string {
  switch (section) {
    case 'now':
      return 'Now'
    case 'next':
      return 'Next'
    case 'blocked':
      return 'Blocked'
    case 'later':
      return 'Later'
    case 'done':
      return 'Done'
    default:
      return 'Tasks'
  }
}

/**
 * Get all completed tasks from both groups and standalone
 */
export function getAllTasks(
  sliceGroups: SliceGroup[],
  standaloneTasks: CompletedTask[],
): CompletedTask[] {
  const tasks: CompletedTask[] = []
  for (const group of sliceGroups) {
    tasks.push(...group.tasks)
  }
  tasks.push(...standaloneTasks)
  return tasks
}
