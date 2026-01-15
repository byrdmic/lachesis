// Types for system prompt building

import type { PlanningLevel } from '../../core/project/types'
import type { WorkflowDefinition } from '../../core/workflows/types'

export type SystemPromptOptions = {
  /**
   * Session type: 'new' for project discovery/creation, 'existing' for continuing a project.
   */
  sessionType?: 'new' | 'existing'
  /**
   * Project name (can be empty for new projects that haven't been named yet).
   */
  projectName?: string
  /**
   * One-liner description (can be empty for new projects).
   */
  oneLiner?: string
  /**
   * Planning level for new projects (light spark, some notes, well defined, etc.).
   */
  planningLevel?: PlanningLevel
  /**
   * Topics already covered in the conversation (for new project discovery).
   */
  coveredTopics?: string[]
  /**
   * Current hour (0-23) for time-appropriate greetings.
   */
  currentHour?: number
  /**
   * Whether this is the first message in the conversation.
   */
  isFirstMessage?: boolean
  /**
   * Project snapshot summary for existing projects (future use).
   */
  snapshotSummary?: string
  /**
   * Active workflow definition (when a workflow is being executed).
   */
  activeWorkflow?: WorkflowDefinition
  /**
   * File contents for the active workflow (actual content of readFiles).
   */
  workflowFileContents?: string
  /**
   * File being filled in (when user clicks "Fill with AI").
   * This triggers special handling to provide context files.
   */
  focusedFile?: string
  /**
   * File contents for the focused file and related context files.
   */
  focusedFileContents?: string
  /**
   * Recent commits from GitHub (formatted git log).
   * Provides context about what work has been done recently.
   */
  recentCommits?: string
}

export type ExistingProjectPromptOptions = {
  projectName: string
  timeGreeting: string
  isFirstMessage: boolean
  snapshotSummary: string
  activeWorkflow?: WorkflowDefinition
  workflowFileContents?: string
  focusedFile?: string
  focusedFileContents?: string
  recentCommits?: string
}
