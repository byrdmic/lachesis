// Issue types - definitions for project health issues

import type { ExpectedCoreFile } from '../snapshot'

/**
 * Types of issues that can be detected in a project.
 */
export type IssueType =
  | 'missing'
  | 'template_only'
  | 'thin'
  | 'config'
  | 'headings_invalid'
  | 'milestone_complete'
  | 'milestone_tasks_remain'
  | 'all_milestones_complete'

/**
 * Files that can have issues (core files + config).
 */
export type IssueFile = ExpectedCoreFile | '.ai/config.json'

/**
 * A project issue that needs attention.
 */
export type ProjectIssue = {
  /** The file this issue relates to */
  file: IssueFile
  /** The type of issue */
  type: IssueType
  /** Human-readable description of the issue */
  message: string
  /** Additional details shown below the message (e.g., list of missing headings) */
  details?: string
  /** Label for the primary fix button */
  fixLabel: string
  /** Action to execute when fix is clicked */
  fixAction: () => Promise<void>
  /** Optional label for secondary fix action */
  secondaryFixLabel?: string
  /** Optional secondary fix action */
  secondaryFixAction?: () => Promise<void>
}

/**
 * Callbacks for the issues panel to communicate with parent components.
 */
export type IssuesPanelCallbacks = {
  /** Called when an issue needs AI assistance (triggers chat input) */
  onStartAIChat: (message: string, focusedFile?: ExpectedCoreFile) => void
  /** Called after a fix is applied to refresh the snapshot */
  onSnapshotRefresh: () => Promise<import('../snapshot').ProjectSnapshot>
}
