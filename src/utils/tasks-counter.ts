/**
 * Tasks.md counter for tracking task completion in the Current section.
 *
 * Counts only top-level tasks (not indented sub-items) in the ## Current section.
 * Also supports legacy section names: ## Now, ## Next, ## Active Tasks
 */

// Section headers that represent "current" tasks
const CURRENT_SECTION_HEADERS = ['current', 'now', 'next', 'active tasks']

// Match section headers: ## Current, ## Now, etc.
const SECTION_HEADER_REGEX = /^##\s+(.+)$/

// Match unchecked task at line start (no leading whitespace)
const UNCHECKED_TASK_REGEX = /^- \[ \]/

// Match checked task at line start (no leading whitespace)
const CHECKED_TASK_REGEX = /^- \[x\]/i

export type TaskCounts = {
  /** Total tasks in Current section */
  total: number
  /** Completed tasks in Current section */
  completed: number
}

/**
 * Count tasks in the Current section of Tasks.md.
 * Only counts top-level tasks (lines starting with "- [ ]" or "- [x]" without indentation).
 */
export function countCurrentSectionTasks(content: string): TaskCounts {
  const lines = content.split('\n')
  let inCurrentSection = false
  let total = 0
  let completed = 0

  for (const line of lines) {
    // Check for section header
    const headerMatch = line.match(SECTION_HEADER_REGEX)
    if (headerMatch) {
      const sectionName = headerMatch[1].toLowerCase().trim()
      inCurrentSection = CURRENT_SECTION_HEADERS.includes(sectionName)
      continue
    }

    // If not in current section, skip
    if (!inCurrentSection) continue

    // Check for top-level tasks (no leading whitespace)
    if (CHECKED_TASK_REGEX.test(line)) {
      total++
      completed++
    } else if (UNCHECKED_TASK_REGEX.test(line)) {
      total++
    }
  }

  return { total, completed }
}
