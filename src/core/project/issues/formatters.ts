// Issue formatters - icons, messages, and display helpers

import type { IssueType, IssueFile } from './types'

// ============================================================================
// Icon Mapping
// ============================================================================

/**
 * Icons for each issue type.
 */
export const ISSUE_ICONS: Record<IssueType, string> = {
  missing: '!',
  template_only: '?',
  thin: '~',
  config: '\u2699', // ⚙
  headings_invalid: '\u2630', // ☰
  tasks_complete: '\u{1F3AF}', // 🎯
  milestone_complete: '\u2713', // ✓
  milestone_tasks_remain: '\u26A0', // ⚠
  all_milestones_complete: '\u2605', // ★
}

/**
 * Get the icon for an issue type.
 */
export function getIssueIcon(type: IssueType): string {
  return ISSUE_ICONS[type]
}

// ============================================================================
// Message Formatting
// ============================================================================

/**
 * Format a "missing file" message.
 */
export function formatMissingFileMessage(fileName: IssueFile): string {
  return `${fileName} does not exist`
}

/**
 * Format a "template only" message.
 */
export function formatTemplateOnlyMessage(fileName: IssueFile): string {
  return `${fileName} has not been filled in`
}

/**
 * Format a "thin content" message.
 */
export function formatThinContentMessage(fileName: IssueFile): string {
  return `${fileName} needs more content`
}

/**
 * Format a "missing headings" message.
 */
export function formatMissingHeadingsMessage(count: number): string {
  return `Missing ${count} heading(s)`
}

/**
 * Format a list of missing headings for display.
 * Removes markdown heading markers (##, ###) for cleaner display.
 */
export function formatMissingHeadingsList(headings: string[]): string {
  const formatted = headings
    .map((h) => h.replace(/^##+ /, '')) // Remove markdown heading markers
    .join(', ')
  return `Missing: ${formatted}`
}

/**
 * Format config issue message based on whether config exists.
 */
export function formatConfigIssueMessage(configMissing: boolean): string {
  return configMissing
    ? 'AI config file is missing'
    : 'GitHub repository not configured'
}

/**
 * Format a "tasks complete" message.
 */
export function formatTasksCompleteMessage(milestoneId: string, milestoneTitle: string): string {
  return `All tasks complete for ${milestoneId} "${milestoneTitle}"!`
}

/**
 * Format a "milestone complete" message.
 */
export function formatMilestoneCompleteMessage(milestoneId: string, milestoneTitle: string): string {
  return `${milestoneId} "${milestoneTitle}" complete!`
}

/**
 * Format a "milestone tasks remain" message.
 */
export function formatMilestoneTasksRemainMessage(
  milestoneId: string,
  milestoneTitle: string,
  taskCount: number
): string {
  return `${milestoneId} "${milestoneTitle}" marked done, but ${taskCount} task${taskCount > 1 ? 's' : ''} remain`
}

/**
 * Format an "all milestones complete" message.
 */
export function formatAllMilestonesCompleteMessage(): string {
  return 'All milestones complete!'
}

// ============================================================================
// Fix Labels
// ============================================================================

/**
 * Get the default fix label for an issue type.
 */
export function getDefaultFixLabel(type: IssueType): string {
  switch (type) {
    case 'missing':
      return 'Create File'
    case 'template_only':
      return 'Fill with AI'
    case 'thin':
      return 'Expand with AI'
    case 'config':
      return 'Configure'
    case 'headings_invalid':
      return 'Add Missing (AI)'
    case 'tasks_complete':
      return 'Close Milestone'
    case 'milestone_complete':
      return 'Plan Next Phase'
    case 'milestone_tasks_remain':
      return 'Review Tasks'
    case 'all_milestones_complete':
      return 'Celebrate!'
    default:
      return 'Fix'
  }
}

// ============================================================================
// Issue Count Formatting
// ============================================================================

/**
 * Format the issues header text.
 */
export function formatIssuesHeader(count: number): string {
  return `${count} issue${count > 1 ? 's' : ''} to address`
}

// ============================================================================
// CSS Class Helpers
// ============================================================================

/**
 * Get the CSS class for an issue type.
 */
export function getIssueTypeClass(type: IssueType): string {
  return `lachesis-issue-${type}`
}
