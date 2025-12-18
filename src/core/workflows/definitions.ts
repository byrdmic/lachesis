/**
 * Workflow definitions for Lachesis.
 *
 * Each workflow has explicit boundaries and rules that the AI must obey.
 */

import type { WorkflowDefinition, WorkflowName } from './types.ts'

/**
 * Core project files that workflows may reference.
 */
export const PROJECT_FILES = {
  overview: 'Overview.md',
  roadmap: 'Roadmap.md',
  tasks: 'Tasks.md',
  log: 'Log.md',
  ideas: 'Ideas.md',
  archive: 'Archive.md',
} as const

/**
 * All workflow definitions.
 */
export const WORKFLOW_DEFINITIONS: Record<WorkflowName, WorkflowDefinition> = {
  /**
   * Synthesize: Gentle review and light polish for readability/consistency.
   */
  synthesize: {
    name: 'synthesize',
    displayName: 'Synthesize',
    description: 'Gentle review and light polish for readability/consistency.',
    intent:
      'Review project files for clarity, consistency, and readability. Apply light edits to improve flow without changing meaning or structure.',
    readFiles: [
      PROJECT_FILES.overview,
      PROJECT_FILES.roadmap,
      PROJECT_FILES.tasks,
      PROJECT_FILES.log,
      PROJECT_FILES.ideas,
    ],
    writeFiles: [
      PROJECT_FILES.overview,
      PROJECT_FILES.roadmap,
      PROJECT_FILES.tasks,
      PROJECT_FILES.log,
      PROJECT_FILES.ideas,
    ],
    risk: 'low',
    confirmation: 'none',
    allowsDelete: false,
    allowsCrossFileMove: false,
    rules: [
      'Polish for readability and consistency only',
      'Do not move content between files',
      'Do not delete any user content',
      'Do not add new sections or restructure',
      'Preserve the user\'s voice and intent',
      'Fix typos, grammar, and formatting issues',
      'Improve clarity of unclear phrasing',
    ],
  },

  /**
   * Harvest Tasks: Extract actionable items from Log and Ideas into Tasks.
   */
  'harvest-tasks': {
    name: 'harvest-tasks',
    displayName: 'Harvest Tasks',
    description: 'Extract actionable items from Log.md and Ideas.md into Tasks.md.',
    intent:
      'Scan Log.md and Ideas.md for actionable items. Copy them into Tasks.md with source references. Do not remove from source files.',
    readFiles: [PROJECT_FILES.log, PROJECT_FILES.ideas, PROJECT_FILES.tasks],
    writeFiles: [PROJECT_FILES.tasks],
    risk: 'low',
    confirmation: 'preview',
    allowsDelete: false,
    allowsCrossFileMove: false, // It copies, not moves
    rules: [
      'Only extract clearly actionable items (things that can be done)',
      'Every extracted task MUST include a source reference (e.g., "from Log 2025-12-17")',
      'Do NOT delete from Log.md or Ideas.md - copy only',
      'Avoid duplicating tasks that already exist in Tasks.md',
      'Preserve the original wording where possible',
      'Group related tasks if they belong together',
    ],
  },

  /**
   * Triage: Turn Tasks.md into an executable short list.
   */
  triage: {
    name: 'triage',
    displayName: 'Triage',
    description: 'Turn Tasks.md into an executable short list.',
    intent:
      'Review Tasks.md and organize it for execution: pick Next 1-3 actions, split oversized tasks, flag unclear tasks needing clarification.',
    readFiles: [PROJECT_FILES.tasks, PROJECT_FILES.roadmap],
    writeFiles: [PROJECT_FILES.tasks],
    risk: 'low',
    confirmation: 'preview',
    allowsDelete: false,
    allowsCrossFileMove: false,
    rules: [
      'Identify and mark the Next 1-3 concrete actions',
      'Split oversized tasks into smaller, actionable steps',
      'Flag tasks that are unclear or need more definition',
      'Do not delete tasks - only reorganize and clarify',
      'Consider Roadmap.md context when prioritizing',
      'Each "next action" should be completable in one sitting',
    ],
  },

  /**
   * Log Digest: Normalize and title log entries.
   */
  'log-digest': {
    name: 'log-digest',
    displayName: 'Log Digest',
    description: 'Add titles to untitled log entries for scannability.',
    intent:
      'Make Log.md scannable by ensuring all entries have proper titles. Normalize inline time notes to proper headings.',
    readFiles: [PROJECT_FILES.log],
    writeFiles: [PROJECT_FILES.log],
    risk: 'low',
    confirmation: 'none', // Applies directly
    allowsDelete: false,
    allowsCrossFileMove: false,
    rules: [
      'Only edit headings and structural formatting - never rewrite entry bodies',
      'An entry is "titled" if its heading contains " — " (em-dash delimiter)',
      'Untitled: ### 14:32  |  Titled: ### 14:32 — Something specific',
      'Generate titles: 3-10 words, headline-style, specific to the content',
      'Avoid filler titles like "Update", "Progress", "Notes"',
      'Do NOT retitle entries that already have titles',
      'Convert inline time notes (e.g., "14:32 text") to proper headings',
      'Prefer titling time entries (### HH:MM) over day entries (## YYYY-MM-DD)',
    ],
  },

  /**
   * Align Templates: Align project file structure to canonical templates.
   */
  'align-templates': {
    name: 'align-templates',
    displayName: 'Align Templates',
    description: 'Align project file structure to canonical templates.',
    intent:
      'Compare project files against canonical templates. Add missing sections, flag extra/outdated sections, and optionally move misplaced content.',
    readFiles: [
      PROJECT_FILES.overview,
      PROJECT_FILES.roadmap,
      PROJECT_FILES.tasks,
      PROJECT_FILES.log,
      PROJECT_FILES.ideas,
      PROJECT_FILES.archive,
    ],
    writeFiles: [
      PROJECT_FILES.overview,
      PROJECT_FILES.roadmap,
      PROJECT_FILES.tasks,
      PROJECT_FILES.log,
      PROJECT_FILES.ideas,
      PROJECT_FILES.archive,
    ],
    risk: 'high',
    confirmation: 'confirm',
    allowsDelete: false,
    allowsCrossFileMove: true, // This workflow CAN move content between files
    rules: [
      'Compare file structure (headers/sections) against canonical templates',
      'Detect missing sections, extra sections, and misplaced content',
      'Add missing sections with template placeholders',
      'Flag extra sections for user decision (keep/remove/move)',
      'Move misplaced content to the correct file when confirmed',
      'Do not delete user content - only restructure',
      'Always preview changes before applying',
    ],
  },

  /**
   * Archive Pass: Move completed/superseded work to Archive.md.
   */
  'archive-pass': {
    name: 'archive-pass',
    displayName: 'Archive Pass',
    description: 'Move completed or superseded work into Archive.md.',
    intent:
      'Keep active files lean by moving completed tasks, old log entries, or superseded ideas to Archive.md.',
    readFiles: [
      PROJECT_FILES.tasks,
      PROJECT_FILES.log,
      PROJECT_FILES.ideas,
      PROJECT_FILES.archive,
    ],
    writeFiles: [PROJECT_FILES.tasks, PROJECT_FILES.log, PROJECT_FILES.ideas, PROJECT_FILES.archive],
    risk: 'medium',
    confirmation: 'preview',
    allowsDelete: true, // Moves content out (deletion from source)
    allowsCrossFileMove: true,
    rules: [
      'Move completed tasks from Tasks.md to Archive.md',
      'Move old log entries (user-defined threshold) to Archive.md',
      'Move superseded ideas from Ideas.md to Archive.md',
      'Preserve full content when archiving - no summarization',
      'Add archive date/reason when moving content',
      'Always preview what will be archived before applying',
      'Do not archive anything still referenced as active',
    ],
  },
}

/**
 * Get a workflow definition by name.
 */
export function getWorkflowDefinition(name: WorkflowName): WorkflowDefinition {
  return WORKFLOW_DEFINITIONS[name]
}

/**
 * Get all workflow definitions.
 */
export function getAllWorkflows(): WorkflowDefinition[] {
  return Object.values(WORKFLOW_DEFINITIONS)
}

/**
 * Get a brief summary of all workflows for display/advertising.
 */
export function getWorkflowSummary(): string {
  return getAllWorkflows()
    .map((w) => `• **${w.displayName}**: ${w.description}`)
    .join('\n')
}
