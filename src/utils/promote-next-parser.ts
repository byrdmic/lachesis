/**
 * Promote Next Task Parser
 *
 * Types and utilities for the "Tasks: Promote Next" workflow.
 * Handles parsing AI responses for task promotion suggestions
 * and applying the promotion to Tasks.md.
 */

// ============================================================================
// Constants
// ============================================================================

/** Action labels for display */
export const PROMOTE_ACTION_LABELS: Record<PromoteAction, string> = {
  promote: 'Promote to Now',
  skip: 'Skip',
}

/** Pattern to extract slice reference from a task line */
const SLICE_REF_PATTERN = /\[\[Roadmap#(VS\d+\s*[—–-]\s*.+?)\]\]/

/** Pattern to detect an unchecked task */
const UNCHECKED_TASK_PATTERN = /^\s*-\s*\[\s*\]\s+(.+)$/

// ============================================================================
// Types
// ============================================================================

/**
 * Action the user can take for the selected task
 */
export type PromoteAction = 'promote' | 'skip'

/**
 * Status of the promote workflow response
 */
export type PromoteStatus = 'success' | 'already_active' | 'no_tasks'

/**
 * Source section for the task being promoted
 */
export type TaskSourceSection = 'next' | 'later'

/**
 * A candidate task that was considered for promotion
 */
export interface CandidateTask {
  text: string
  sourceSection: TaskSourceSection
  sliceLink: string | null
  score: number // 1-5
  note: string // Brief explanation of score
}

/**
 * The selected task to promote
 */
export interface SelectedTask {
  text: string
  sourceSection: TaskSourceSection
  sliceLink: string | null
}

/**
 * AI response format for promote-next-task workflow
 */
export interface PromoteNextAIResponse {
  status: PromoteStatus
  selectedTask?: SelectedTask
  reasoning?: string
  candidates?: CandidateTask[]
  currentNowTask?: string // For already_active status
  message?: string // For error/skip cases
}

/**
 * User's selection for the promotion
 */
export interface PromoteSelection {
  action: PromoteAction
  selectedTask: SelectedTask | null
}

/**
 * Summary data for display purposes
 */
export interface PromoteNextSummary {
  status: PromoteStatus
  selectedTaskText: string | null
  sourceSection: TaskSourceSection | null
  candidateCount: number
}

// ============================================================================
// Parsing Functions
// ============================================================================

/**
 * Check if content contains a promote-next-task response
 */
export function containsPromoteNextResponse(content: string): boolean {
  return (
    content.includes('"status"') &&
    (content.includes('"selectedTask"') ||
      content.includes('"already_active"') ||
      content.includes('"no_tasks"'))
  )
}

/**
 * Extract summary information from promote response for display
 */
export function extractPromoteNextSummary(content: string): PromoteNextSummary | null {
  try {
    let jsonStr = content.trim()
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim()
    }

    const parsed = JSON.parse(jsonStr) as PromoteNextAIResponse

    return {
      status: parsed.status,
      selectedTaskText: parsed.selectedTask?.text ?? null,
      sourceSection: parsed.selectedTask?.sourceSection ?? null,
      candidateCount: parsed.candidates?.length ?? 0,
    }
  } catch {
    return null
  }
}

/**
 * Parse the AI response for promote-next-task workflow
 */
export function parsePromoteNextResponse(aiResponse: string): PromoteNextAIResponse {
  try {
    let jsonStr = aiResponse.trim()
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim()
    }

    const parsed = JSON.parse(jsonStr) as PromoteNextAIResponse
    return parsed
  } catch (error) {
    console.error('Failed to parse promote next response:', error)
    return {
      status: 'no_tasks',
      message: 'Failed to parse AI response',
    }
  }
}

// ============================================================================
// Apply Functions
// ============================================================================

/**
 * Apply task promotion to Tasks.md content.
 * Moves the selected task from Next/Later to Now section.
 */
export function applyTaskPromotion(tasksContent: string, selectedTask: SelectedTask): string {
  const lines = tasksContent.split('\n')

  // Section detection patterns
  const nowPattern = /^##\s*Now/i
  const nextPattern = /^##\s*Next/i
  const laterPattern = /^##\s*Later/i
  const blockedPattern = /^##\s*Blocked/i

  // Find the task in the source section
  let taskLineIndex = -1
  let inSourceSection = false
  const targetSection = selectedTask.sourceSection

  // First, find which section headers exist and where they are
  const sectionBoundaries: Array<{ type: string; index: number }> = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (nowPattern.test(line)) {
      sectionBoundaries.push({ type: 'now', index: i })
    } else if (nextPattern.test(line)) {
      sectionBoundaries.push({ type: 'next', index: i })
    } else if (laterPattern.test(line)) {
      sectionBoundaries.push({ type: 'later', index: i })
    } else if (blockedPattern.test(line)) {
      sectionBoundaries.push({ type: 'blocked', index: i })
    } else if (/^##\s+/.test(line)) {
      sectionBoundaries.push({ type: 'other', index: i })
    }
  }

  // Find the source section range
  let sourceSectionStart = -1
  let sourceSectionEnd = lines.length

  for (let i = 0; i < sectionBoundaries.length; i++) {
    if (sectionBoundaries[i].type === targetSection) {
      sourceSectionStart = sectionBoundaries[i].index
      // Find the next section
      if (i + 1 < sectionBoundaries.length) {
        sourceSectionEnd = sectionBoundaries[i + 1].index
      }
      break
    }
  }

  if (sourceSectionStart === -1) {
    console.warn(`Could not find ${targetSection} section`)
    return tasksContent
  }

  // Search for the task within the source section
  // We need to match the task text (allowing for some flexibility)
  const escapedTaskText = selectedTask.text
    .slice(0, 60) // Use first 60 chars to match
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const taskTextPattern = new RegExp(escapedTaskText.slice(0, 40)) // More relaxed matching

  for (let i = sourceSectionStart + 1; i < sourceSectionEnd; i++) {
    const line = lines[i]
    if (UNCHECKED_TASK_PATTERN.test(line)) {
      // Check if this line contains our task text
      if (taskTextPattern.test(line)) {
        taskLineIndex = i
        break
      }
    }
  }

  if (taskLineIndex === -1) {
    console.warn('Could not find task to promote:', selectedTask.text)
    return tasksContent
  }

  // Get the full task line (preserve formatting, slice links, etc.)
  const taskLine = lines[taskLineIndex]

  // Collect any sub-items (indented lines following the task)
  const subItems: string[] = []
  let j = taskLineIndex + 1
  while (j < sourceSectionEnd && /^\s{2,}/.test(lines[j]) && !/^\s*-\s*\[/.test(lines[j])) {
    subItems.push(lines[j])
    j++
  }

  // Remove task and sub-items from source
  lines.splice(taskLineIndex, 1 + subItems.length)

  // Re-find the Now section (indices may have shifted)
  let nowIndex = -1
  for (let i = 0; i < lines.length; i++) {
    if (nowPattern.test(lines[i])) {
      nowIndex = i
      break
    }
  }

  if (nowIndex === -1) {
    console.warn('Could not find Now section')
    return lines.join('\n')
  }

  // Find where to insert in Now section (after heading, after any blank lines)
  let insertIndex = nowIndex + 1

  // Skip blank lines after heading
  while (insertIndex < lines.length && lines[insertIndex].trim() === '') {
    insertIndex++
  }

  // Insert the task at the beginning of Now section (after blanks)
  const insertLines = [taskLine, ...subItems]
  lines.splice(insertIndex, 0, ...insertLines)

  return lines.join('\n')
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if Now section has an active (unchecked) task
 */
export function hasActiveNowTask(tasksContent: string): boolean {
  const lines = tasksContent.split('\n')
  const nowPattern = /^##\s*Now/i
  let inNowSection = false

  for (const line of lines) {
    if (nowPattern.test(line)) {
      inNowSection = true
      continue
    }

    if (inNowSection) {
      // Check if we've left Now section
      if (/^##\s+/.test(line)) {
        break
      }

      // Check for unchecked task
      if (UNCHECKED_TASK_PATTERN.test(line)) {
        return true
      }
    }
  }

  return false
}

/**
 * Extract unchecked tasks from a specific section
 */
export function extractTasksFromSection(
  tasksContent: string,
  section: TaskSourceSection,
): Array<{ text: string; sliceLink: string | null }> {
  const lines = tasksContent.split('\n')
  const tasks: Array<{ text: string; sliceLink: string | null }> = []

  // Section patterns
  const nowPattern = /^##\s*Now/i
  const nextPattern = /^##\s*Next/i
  const laterPattern = /^##\s*Later/i
  const blockedPattern = /^##\s*Blocked/i

  let inTargetSection = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Check section boundaries
    if (section === 'next' && nextPattern.test(line)) {
      inTargetSection = true
      continue
    }
    if (section === 'later' && laterPattern.test(line)) {
      inTargetSection = true
      continue
    }

    // Check if we've left the target section
    if (
      inTargetSection &&
      (nowPattern.test(line) ||
        (section === 'next' && laterPattern.test(line)) ||
        (section === 'later' && nextPattern.test(line)) ||
        blockedPattern.test(line) ||
        /^##\s+/.test(line))
    ) {
      break
    }

    // Check for unchecked task
    if (inTargetSection) {
      const taskMatch = line.match(UNCHECKED_TASK_PATTERN)
      if (taskMatch) {
        const text = taskMatch[1].trim()
        // Extract slice link if present
        const sliceLinkMatch = text.match(SLICE_REF_PATTERN)
        tasks.push({
          text,
          sliceLink: sliceLinkMatch ? `[[Roadmap#${sliceLinkMatch[1]}]]` : null,
        })
      }
    }
  }

  return tasks
}

/**
 * Get default action for a selected task
 * Default is to promote since that's the workflow intent
 */
export function getDefaultPromoteAction(): PromoteAction {
  return 'promote'
}

/**
 * Get a human-readable label for a source section
 */
export function getSourceSectionLabel(section: TaskSourceSection): string {
  switch (section) {
    case 'next':
      return 'Next'
    case 'later':
      return 'Later'
    default:
      return section
  }
}
