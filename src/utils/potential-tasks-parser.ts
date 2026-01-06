/**
 * Potential Tasks Parser
 *
 * Extracts AI-generated potential tasks from Log.md files.
 * Tasks are wrapped in `<!-- AI: potential-tasks start/end -->` comment blocks.
 */

// ============================================================================
// Types
// ============================================================================

export interface PotentialTask {
  id: string // Unique ID (blockIndex-lineNumber)
  text: string // Task text (without checkbox prefix)
  isStrikethrough: boolean // Whether task is crossed out (~~task~~)
  logEntryHeader: string | null // Log entry header (e.g., "11:48am - Title")
  logEntryDate: string | null // Date header (e.g., "## 2024-01-15")
  blockStartLine: number // Line number where the block starts (0-indexed)
  blockEndLine: number // Line number where the block ends (0-indexed)
  taskLineNumber: number // Line number of this specific task (0-indexed)
}

export interface PotentialTasksBlock {
  startLine: number // Line number of `<!-- AI: potential-tasks start -->`
  endLine: number // Line number of `<!-- AI: potential-tasks end -->`
  tasks: PotentialTask[]
  logEntryHeader: string | null
  logEntryDate: string | null
}

export interface ParsedPotentialTasks {
  blocks: PotentialTasksBlock[]
  allTasks: PotentialTask[] // Non-strikethrough tasks only (actionable)
  totalTaskCount: number // All tasks including strikethrough
  actionableTaskCount: number // Non-strikethrough tasks only
}

// ============================================================================
// Constants
// ============================================================================

const BLOCK_START_MARKER = '<!-- AI: potential-tasks start -->'
const BLOCK_END_MARKER = '<!-- AI: potential-tasks end -->'

// Matches task lines: - [ ] task text or - [x] task text
const TASK_LINE_REGEX = /^-\s*\[[ x]\]\s*(.+)$/i

// Matches strikethrough: ~~text~~
const STRIKETHROUGH_REGEX = /^~~(.+)~~$/

// Matches log entry timestamps: 11:48am, 2:30pm, etc.
const LOG_ENTRY_REGEX = /^(\d{1,2}:\d{2}(?:am|pm))\s*(?:-\s*(.+))?$/i

// Matches date headers: ## 2024-01-15, ## January 15, 2024, etc.
const DATE_HEADER_REGEX = /^##\s+(\d{4}-\d{2}-\d{2}|\w+\s+\d{1,2},?\s+\d{4})/

// ============================================================================
// Main Parser Function
// ============================================================================

/**
 * Parse Log.md content and extract all potential tasks blocks.
 */
export function parsePotentialTasks(content: string): ParsedPotentialTasks {
  const lines = content.split('\n')
  const blocks: PotentialTasksBlock[] = []
  let totalTaskCount = 0

  let i = 0
  while (i < lines.length) {
    const line = lines[i].trim()

    // Look for block start marker
    if (line === BLOCK_START_MARKER) {
      const blockStartLine = i
      const tasks: PotentialTask[] = []

      // Find the log entry context by looking backwards
      const context = findLogEntryContext(lines, blockStartLine)

      // Find block end and extract tasks
      i++
      while (i < lines.length) {
        const currentLine = lines[i].trim()

        if (currentLine === BLOCK_END_MARKER) {
          // Found end of block
          blocks.push({
            startLine: blockStartLine,
            endLine: i,
            tasks,
            logEntryHeader: context.header,
            logEntryDate: context.date,
          })
          break
        }

        // Check if this is a task line
        const taskMatch = currentLine.match(TASK_LINE_REGEX)
        if (taskMatch) {
          const rawTaskText = taskMatch[1].trim()
          const { text, isStrikethrough } = parseTaskText(rawTaskText)

          tasks.push({
            id: `${blocks.length}-${i}`,
            text,
            isStrikethrough,
            logEntryHeader: context.header,
            logEntryDate: context.date,
            blockStartLine,
            blockEndLine: -1, // Will be set when block ends
            taskLineNumber: i,
          })
          totalTaskCount++
        }

        i++
      }

      // Update blockEndLine for all tasks in this block
      const blockEndLine = i
      for (const task of tasks) {
        task.blockEndLine = blockEndLine
      }
    }

    i++
  }

  // Filter to only actionable (non-strikethrough) tasks
  const allTasks = blocks.flatMap((b) => b.tasks).filter((t) => !t.isStrikethrough)

  return {
    blocks,
    allTasks,
    totalTaskCount,
    actionableTaskCount: allTasks.length,
  }
}

/**
 * Quick check if content has any actionable potential tasks.
 */
export function hasActionablePotentialTasks(content: string): boolean {
  const parsed = parsePotentialTasks(content)
  return parsed.actionableTaskCount > 0
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Look backwards from a block to find the log entry header and date.
 */
function findLogEntryContext(
  lines: string[],
  blockStartLine: number,
): { header: string | null; date: string | null } {
  let header: string | null = null
  let date: string | null = null

  // Look backwards to find the timestamp header and date
  for (let i = blockStartLine - 1; i >= 0 && i >= blockStartLine - 50; i--) {
    const line = lines[i].trim()

    // Check for log entry timestamp (closer to block, so check first)
    if (!header) {
      const entryMatch = line.match(LOG_ENTRY_REGEX)
      if (entryMatch) {
        // Include the full line as the header
        header = line
      }
    }

    // Check for date header
    if (!date) {
      const dateMatch = line.match(DATE_HEADER_REGEX)
      if (dateMatch) {
        date = dateMatch[1]
      }
    }

    // Stop if we found both
    if (header && date) break

    // Stop if we hit another potential-tasks block (we've gone too far)
    if (line === BLOCK_END_MARKER || line === BLOCK_START_MARKER) break
  }

  return { header, date }
}

/**
 * Parse task text to extract actual text and strikethrough status.
 */
function parseTaskText(rawText: string): { text: string; isStrikethrough: boolean } {
  // Check if entire text is wrapped in strikethrough
  const strikeMatch = rawText.match(STRIKETHROUGH_REGEX)
  if (strikeMatch) {
    return {
      text: strikeMatch[1].trim(),
      isStrikethrough: true,
    }
  }

  return {
    text: rawText,
    isStrikethrough: false,
  }
}

// ============================================================================
// File Update Functions
// ============================================================================

export interface TaskUpdateAction {
  taskId: string
  action: 'keep' | 'reject' | 'move-to-future'
}

export interface LogUpdateResult {
  newContent: string
  tasksRejected: number
  tasksMoved: number
  blocksRemoved: number
}

/**
 * Update Log.md content based on task actions.
 * - reject: Apply strikethrough to task
 * - move-to-future: Remove task line from log
 * - keep: No changes
 */
export function updateLogWithTaskActions(
  logContent: string,
  actions: TaskUpdateAction[],
  parsedTasks: ParsedPotentialTasks,
): LogUpdateResult {
  const lines = logContent.split('\n')
  const actionMap = new Map(actions.map((a) => [a.taskId, a.action]))

  let tasksRejected = 0
  let tasksMoved = 0
  const linesToRemove = new Set<number>()
  const linesToStrikethrough = new Set<number>()

  // Process each task
  for (const block of parsedTasks.blocks) {
    for (const task of block.tasks) {
      const action = actionMap.get(task.id)
      if (!action || action === 'keep') continue

      if (action === 'reject') {
        linesToStrikethrough.add(task.taskLineNumber)
        tasksRejected++
      } else if (action === 'move-to-future') {
        linesToRemove.add(task.taskLineNumber)
        tasksMoved++
      }
    }
  }

  // Apply strikethroughs first
  for (const lineNum of linesToStrikethrough) {
    const line = lines[lineNum]
    // Transform `- [ ] task text` to `- [ ] ~~task text~~`
    const match = line.match(/^(\s*-\s*\[[ x]\]\s*)(.+)$/i)
    if (match) {
      const prefix = match[1]
      const taskText = match[2]
      // Don't double-strikethrough
      if (!taskText.startsWith('~~')) {
        lines[lineNum] = `${prefix}~~${taskText}~~`
      }
    }
  }

  // Check which blocks should be completely removed (all tasks removed/moved)
  const blocksToRemove: PotentialTasksBlock[] = []
  for (const block of parsedTasks.blocks) {
    const remainingTasks = block.tasks.filter((t) => {
      const action = actionMap.get(t.id)
      // Task remains if: action is keep, reject, or no action
      // Task is removed if: action is move-to-future
      return action !== 'move-to-future'
    })

    // Also check if all remaining tasks are strikethrough (nothing actionable left)
    const actionableRemaining = remainingTasks.filter((t) => {
      const action = actionMap.get(t.id)
      // After this update, will this task be strikethrough?
      const willBeStrikethrough = t.isStrikethrough || action === 'reject'
      return !willBeStrikethrough
    })

    if (actionableRemaining.length === 0 && remainingTasks.length === 0) {
      // All tasks moved, remove entire block
      blocksToRemove.push(block)
      for (let i = block.startLine; i <= block.endLine; i++) {
        linesToRemove.add(i)
      }
      // Also remove the heading line if it's immediately before the block
      if (block.startLine > 0) {
        const headingLine = lines[block.startLine - 1].trim()
        if (headingLine.match(/^#{1,6}\s*potential\s+tasks/i)) {
          linesToRemove.add(block.startLine - 1)
        }
      }
    }
  }

  // Build new content, skipping removed lines
  const newLines = lines.filter((_, idx) => !linesToRemove.has(idx))

  return {
    newContent: newLines.join('\n'),
    tasksRejected,
    tasksMoved,
    blocksRemoved: blocksToRemove.length,
  }
}

/**
 * Append tasks to the "Potential Future Tasks" section in Tasks.md.
 * Creates the section if it doesn't exist.
 */
export function appendToFutureTasksSection(
  tasksContent: string,
  newTasks: Array<{ text: string; sourceDate: string | null }>,
): string {
  if (newTasks.length === 0) return tasksContent

  const SECTION_HEADER = '## Potential Future Tasks'
  const lines = tasksContent.split('\n')

  // Find the section or determine where to add it
  let sectionStartIndex = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === SECTION_HEADER) {
      sectionStartIndex = i
      break
    }
  }

  // Format new tasks
  const newTaskLines = newTasks.map((t) => {
    const sourceComment = t.sourceDate ? ` <!-- from Log.md ${t.sourceDate} -->` : ' <!-- from Log.md -->'
    return `- [ ] ${t.text}${sourceComment}`
  })

  if (sectionStartIndex !== -1) {
    // Section exists, find where to insert tasks (after header, before next section)
    let insertIndex = sectionStartIndex + 1

    // Skip any blank lines after the header
    while (insertIndex < lines.length && lines[insertIndex].trim() === '') {
      insertIndex++
    }

    // Find the end of the section (next ## header or end of file)
    let sectionEndIndex = insertIndex
    while (sectionEndIndex < lines.length) {
      if (lines[sectionEndIndex].match(/^##\s/) && sectionEndIndex !== sectionStartIndex) {
        break
      }
      sectionEndIndex++
    }

    // Insert before the next section (or at end)
    lines.splice(sectionEndIndex, 0, ...newTaskLines, '')
  } else {
    // Section doesn't exist, add at end of file
    // Ensure there's a blank line before the new section
    if (lines[lines.length - 1]?.trim() !== '') {
      lines.push('')
    }
    lines.push(SECTION_HEADER)
    lines.push(...newTaskLines)
  }

  return lines.join('\n')
}
