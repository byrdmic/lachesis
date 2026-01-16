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
