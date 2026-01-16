// Issues module - project health issue detection and formatting

// Types
export type {
  IssueType,
  IssueFile,
  ProjectIssue,
  IssuesPanelCallbacks,
} from './types'

// Formatters
export {
  ISSUE_ICONS,
  getIssueIcon,
  formatMissingFileMessage,
  formatTemplateOnlyMessage,
  formatThinContentMessage,
  formatMissingHeadingsMessage,
  formatMissingHeadingsList,
  formatConfigIssueMessage,
  getDefaultFixLabel,
  formatIssuesHeader,
  getIssueTypeClass,
} from './formatters'

// Validators
export type { FixActionFactory } from './validators'
export {
  checkOverviewHeadings,
  checkRoadmapHeadings,
  buildIssuesFromSnapshot,
} from './validators'
