/**
 * Sync Commits Parser
 *
 * Types and utilities for the "Tasks: Sync Commits" workflow.
 * Handles parsing AI responses that match git commits to tasks,
 * and applying user selections to Tasks.md and Archive.md.
 */

// ============================================================================
// Constants
// ============================================================================

/** Action labels for display */
export const SYNC_ACTION_LABELS: Record<SyncAction, string> = {
  'mark-complete': 'Mark Complete Only',
  'mark-archive': 'Mark + Archive',
  'skip': 'Skip',
}

/** Confidence level badges */
export const CONFIDENCE_BADGES: Record<ConfidenceLevel, { label: string; color: string }> = {
  high: { label: 'High', color: 'green' },
  medium: { label: 'Medium', color: 'yellow' },
  low: { label: 'Low', color: 'red' },
}

// ============================================================================
// Types
// ============================================================================

/**
 * Confidence level for a commit-to-task match
 */
export type ConfidenceLevel = 'high' | 'medium' | 'low'

/**
 * Task section in Tasks.md
 */
export type TaskSection = 'now' | 'next' | 'later'

/**
 * Action the user can take for each match
 */
export type SyncAction = 'mark-complete' | 'mark-archive' | 'skip'

/**
 * A commit-to-task match from the AI analysis
 */
export interface CommitMatch {
  id: string // Unique ID for UI tracking
  commitSha: string // Full commit SHA
  commitShortSha: string // Short SHA (7 chars)
  commitMessage: string // Full commit message (title + body)
  commitTitle: string // Just the first line
  commitDate: string // ISO date string
  commitUrl: string | null // GitHub URL if available
  taskText: string // The task description from Tasks.md
  taskSection: TaskSection // Which section the task is in
  confidence: ConfidenceLevel
  reasoning: string | null // Why AI thinks this matches
  alreadyCompleted?: boolean // Whether the task is already marked complete in Tasks.md
}

/**
 * A commit that didn't match any task
 */
export interface UnmatchedCommit {
  commitSha: string
  commitShortSha: string
  commitTitle: string
  commitDate: string
  reasoning: string // Why no match was found
}

/**
 * User's selection for a commit match
 */
export interface SyncCommitSelection {
  matchId: string
  action: SyncAction
}

/**
 * AI response format for sync-commits workflow
 */
export interface SyncCommitsAIResponse {
  matches: Array<{
    commitSha: string
    commitMessage: string
    taskText: string
    taskSection: string
    confidence: ConfidenceLevel
    reasoning?: string
  }>
  unmatchedCommits: Array<{
    commitSha: string
    commitMessage: string
    reasoning: string
  }>
  summary: {
    totalCommits: number
    matchedCount: number
    unmatchedCount: number
  }
}

/**
 * Parsed result from AI response
 */
export interface ParsedSyncCommitsResult {
  matches: CommitMatch[]
  unmatchedCommits: UnmatchedCommit[]
  summary: {
    totalCommits: number
    matchedCount: number
    unmatchedCount: number
  }
}

/**
 * A commit from the git log
 */
export interface GitCommit {
  sha: string
  message: string // Full message including body
  date: string
  url: string | null
}

// ============================================================================
// Parsing Functions
// ============================================================================

/**
 * Check if a message contains sync-commits JSON response
 */
export function containsSyncCommitsResponse(content: string): boolean {
  // Check for the distinctive JSON structure from sync-commits workflow
  // Must have matches array and summary with totalCommits/matchedCount
  // Note: "taskText" and "confidence" only exist when there ARE matches,
  // so we check for the summary structure instead
  return (
    content.includes('"matches"') &&
    content.includes('"unmatchedCommits"') &&
    content.includes('"summary"') &&
    (content.includes('"totalCommits"') || content.includes('"matchedCount"'))
  )
}

/**
 * Summary data extracted from sync-commits response for display purposes.
 * Does not require commits data - just extracts counts from the JSON.
 */
export type SyncCommitsSummary = {
  matchedCount: number
  unmatchedCount: number
  highCount: number
  mediumCount: number
  lowCount: number
}

/**
 * Extract summary information from sync-commits response for display.
 * This is a lightweight alternative to parseSyncCommitsResponse that
 * doesn't need the commits array - just extracts counts for UI display.
 */
export function extractSyncCommitsSummary(content: string): SyncCommitsSummary | null {
  try {
    // Extract JSON from the response (might be wrapped in markdown code blocks)
    let jsonStr = content.trim()

    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim()
    }

    const parsed = JSON.parse(jsonStr)

    if (!parsed.matches || !Array.isArray(parsed.matches)) {
      return null
    }

    const matches = parsed.matches as Array<{ confidence?: string }>
    const unmatchedCommits = (parsed.unmatchedCommits || []) as Array<unknown>

    return {
      matchedCount: matches.length,
      unmatchedCount: unmatchedCommits.length,
      highCount: matches.filter((m) => m.confidence === 'high').length,
      mediumCount: matches.filter((m) => m.confidence === 'medium').length,
      lowCount: matches.filter((m) => m.confidence === 'low').length,
    }
  } catch {
    return null
  }
}

/**
 * Parse AI JSON response into CommitMatch array
 */
export function parseSyncCommitsResponse(
  aiResponse: string,
  commits: GitCommit[],
): ParsedSyncCommitsResult {
  try {
    // Extract JSON from the response (might be wrapped in markdown code blocks)
    let jsonStr = aiResponse.trim()

    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim()
    }

    const parsed: SyncCommitsAIResponse = JSON.parse(jsonStr)

    if (!parsed.matches || !Array.isArray(parsed.matches)) {
      console.warn('Sync commits response missing matches array')
      return {
        matches: [],
        unmatchedCommits: [],
        summary: { totalCommits: 0, matchedCount: 0, unmatchedCount: 0 },
      }
    }

    // Build a map of commits by SHA for looking up full data
    const commitMap = new Map(commits.map((c) => [c.sha, c]))
    const commitMapShort = new Map(commits.map((c) => [c.sha.slice(0, 7), c]))

    const matches: CommitMatch[] = parsed.matches.map((match, index) => {
      // Find the full commit data
      const commit = commitMap.get(match.commitSha) || commitMapShort.get(match.commitSha.slice(0, 7))
      const commitTitle = match.commitMessage.split('\n')[0]

      return {
        id: `sync-${index}`,
        commitSha: match.commitSha,
        commitShortSha: match.commitSha.slice(0, 7),
        commitMessage: match.commitMessage,
        commitTitle,
        commitDate: commit?.date || '',
        commitUrl: commit?.url || null,
        taskText: match.taskText,
        taskSection: normalizeTaskSection(match.taskSection),
        confidence: match.confidence || 'medium',
        reasoning: match.reasoning || null,
      }
    })

    const unmatchedCommits: UnmatchedCommit[] = (parsed.unmatchedCommits || []).map((uc) => {
      const commit = commitMap.get(uc.commitSha) || commitMapShort.get(uc.commitSha.slice(0, 7))
      return {
        commitSha: uc.commitSha,
        commitShortSha: uc.commitSha.slice(0, 7),
        commitTitle: uc.commitMessage.split('\n')[0],
        commitDate: commit?.date || '',
        reasoning: uc.reasoning,
      }
    })

    return {
      matches,
      unmatchedCommits,
      summary: parsed.summary || {
        totalCommits: matches.length + unmatchedCommits.length,
        matchedCount: matches.length,
        unmatchedCount: unmatchedCommits.length,
      },
    }
  } catch (error) {
    console.error('Failed to parse sync commits response:', error)
    return {
      matches: [],
      unmatchedCommits: [],
      summary: { totalCommits: 0, matchedCount: 0, unmatchedCount: 0 },
    }
  }
}

/**
 * Normalize task section strings from AI response.
 * Supports both new (now/next/later) and legacy (next-actions/active-tasks/future-tasks) values.
 */
function normalizeTaskSection(section: string): TaskSection {
  const normalized = section.toLowerCase().replace(/[^a-z]/g, '')
  // "now" or legacy "next-actions" / "next 1-3 actions"
  if (normalized === 'now' || normalized.includes('action')) {
    return 'now'
  }
  // "later" or legacy "future-tasks" / "future tasks"
  if (normalized === 'later' || normalized.includes('future')) {
    return 'later'
  }
  // Default to "next" (or legacy "active-tasks")
  return 'next'
}

// ============================================================================
// Apply Functions
// ============================================================================

/**
 * Apply task completions to Tasks.md content
 * Changes `- [ ]` to `- [x]` for matched tasks
 */
export function applyTaskCompletions(
  tasksContent: string,
  selections: SyncCommitSelection[],
  matches: CommitMatch[],
): string {
  const lines = tasksContent.split('\n')
  const matchMap = new Map(matches.map((m) => [m.id, m]))

  // Get tasks to mark complete
  const tasksToComplete = selections
    .filter((s) => s.action === 'mark-complete' || s.action === 'mark-archive')
    .map((s) => matchMap.get(s.matchId))
    .filter((m): m is CommitMatch => m !== undefined)

  // For each task to complete, find it in the content and mark it
  for (const match of tasksToComplete) {
    const taskText = match.taskText
    // Escape special regex characters in task text
    const escapedTaskText = taskText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

    // Match unchecked task with this text
    // Pattern: - [ ] <taskText> (possibly with trailing comments/links)
    const taskPattern = new RegExp(
      `^(\\s*-\\s*)\\[\\s*\\](\\s+${escapedTaskText.slice(0, 50)})`,
      'm',
    )

    for (let i = 0; i < lines.length; i++) {
      if (taskPattern.test(lines[i])) {
        // Replace [ ] with [x]
        lines[i] = lines[i].replace(/\[\s*\]/, '[x]')
        break // Only mark the first matching occurrence
      }
    }
  }

  return lines.join('\n')
}

/**
 * Format a single archive entry for a completed task
 */
export function formatArchiveEntry(match: CommitMatch): string {
  const today = new Date().toISOString().split('T')[0]
  const taskName = match.taskText.length > 60 ? match.taskText.slice(0, 57) + '...' : match.taskText

  // Extract notes from commit body (everything after first line)
  const commitLines = match.commitMessage.split('\n')
  const commitBody = commitLines.slice(1).join('\n').trim()
  const notes = commitBody ? summarizeCommitBody(commitBody) : 'Completed via git commit'

  // Format commit reference
  const commitRef = match.commitUrl
    ? `[${match.commitShortSha}](${match.commitUrl})`
    : match.commitShortSha

  return [
    `### ${today} - ${taskName}`,
    `**What:** ${match.taskText}`,
    `**Commit:** ${commitRef}`,
    `**Notes:** ${notes}`,
    '',
  ].join('\n')
}

/**
 * Summarize commit body to a short notes string
 */
function summarizeCommitBody(body: string): string {
  // Take first meaningful line or first 100 chars
  const lines = body
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('Co-Authored-By'))
  if (lines.length === 0) return 'Completed via git commit'

  const firstLine = lines[0].trim()
  if (firstLine.length <= 100) return firstLine
  return firstLine.slice(0, 97) + '...'
}

/**
 * Build archive entries for all tasks being archived
 */
export function buildArchiveEntries(
  selections: SyncCommitSelection[],
  matches: CommitMatch[],
): string {
  const matchMap = new Map(matches.map((m) => [m.id, m]))

  const entries = selections
    .filter((s) => s.action === 'mark-archive')
    .map((s) => matchMap.get(s.matchId))
    .filter((m): m is CommitMatch => m !== undefined)
    .map((m) => formatArchiveEntry(m))

  return entries.join('\n')
}

/**
 * Apply archive entries to Archive.md content
 * Inserts under "## Completed Work" section
 */
export function applyArchiveEntries(archiveContent: string, entries: string): string {
  if (!entries.trim()) return archiveContent

  const lines = archiveContent.split('\n')

  // Find "## Completed Work" section
  const completedWorkRegex = /^##\s*Completed\s+Work/i
  let insertIndex = -1

  for (let i = 0; i < lines.length; i++) {
    if (completedWorkRegex.test(lines[i])) {
      insertIndex = i + 1
      // Skip any blank lines after the heading
      while (insertIndex < lines.length && lines[insertIndex].trim() === '') {
        insertIndex++
      }
      break
    }
  }

  if (insertIndex === -1) {
    // No "Completed Work" section found, create it at the start (after frontmatter)
    let afterFrontmatter = 0
    if (lines[0] === '---') {
      for (let i = 1; i < lines.length; i++) {
        if (lines[i] === '---') {
          afterFrontmatter = i + 1
          break
        }
      }
    }

    // Insert new section
    const newSection = ['', '## Completed Work', '', entries]
    lines.splice(afterFrontmatter, 0, ...newSection)
  } else {
    // Insert entries at the found position
    lines.splice(insertIndex, 0, entries)
  }

  return lines.join('\n')
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get default action based on confidence level
 */
export function getDefaultAction(confidence: ConfidenceLevel): SyncAction {
  switch (confidence) {
    case 'high':
      return 'mark-archive'
    case 'medium':
      return 'mark-complete'
    case 'low':
      return 'skip'
  }
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
    case 'later':
      return 'Later'
  }
}

/**
 * Extract unchecked tasks from Tasks.md content
 */
export function extractUncheckedTasks(
  tasksContent: string,
): Array<{ text: string; section: TaskSection; lineNumber: number }> {
  const lines = tasksContent.split('\n')
  const tasks: Array<{ text: string; section: TaskSection; lineNumber: number }> = []

  let currentSection: TaskSection = 'next'

  // Section detection patterns - support both new and legacy section names
  const nowRegex = /^##\s*(?:Now|Next\s+1[–-]3\s+Actions)/i
  const nextRegex = /^##\s*(?:Next|Active\s+Tasks)$/i
  const laterRegex = /^##\s*(?:Later|Future\s+Tasks|Potential\s+Future\s+Tasks)/i

  // Unchecked task pattern
  const uncheckedTaskRegex = /^\s*-\s*\[\s*\]\s+(.+)$/

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Update current section
    if (nowRegex.test(line)) {
      currentSection = 'now'
      continue
    }
    if (nextRegex.test(line)) {
      currentSection = 'next'
      continue
    }
    if (laterRegex.test(line)) {
      currentSection = 'later'
      continue
    }

    // Check for unchecked task
    const taskMatch = line.match(uncheckedTaskRegex)
    if (taskMatch) {
      // Clean up task text (remove wiki links, comments, etc. for matching purposes)
      let text = taskMatch[1].trim()
      // Remove trailing comments
      text = text.replace(/<!--.*?-->/, '').trim()
      // Keep wiki links but note their presence
      tasks.push({
        text,
        section: currentSection,
        lineNumber: i,
      })
    }
  }

  return tasks
}
