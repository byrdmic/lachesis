/**
 * Workflow definitions for Lachesis.
 *
 * Each workflow has:
 * - Clear intent (what it is for)
 * - Explicit file boundaries (what it may read/write)
 * - Risk level
 * - Confirmation requirements
 * - Specific rules
 */

import type { WorkflowName, WorkflowDefinition } from './types'

// ============================================================================
// File Constants
// ============================================================================

export const PROJECT_FILES = {
  overview: 'Overview.md',
  roadmap: 'Roadmap.md',
  tasks: 'Tasks.md',
  log: 'Log.md',
  ideas: 'Ideas.md',
  archive: 'Archive.md',
} as const

const ALL_CORE_FILES = Object.values(PROJECT_FILES)

// ============================================================================
// Workflow Definitions
// ============================================================================

export const WORKFLOW_DEFINITIONS: Record<WorkflowName, WorkflowDefinition> = {
  /**
   * REFINE LOG: Add short titles to log entries.
   * Low risk, preview confirmation.
   */
  'refine-log': {
    name: 'refine-log',
    displayName: 'Refine Log',
    description: 'Add short titles to log entries',
    intent:
      'Find log entries and add short descriptive titles (1-5 words) after the timestamp. ' +
      'Format: "11:48am - MCP Server" where the title captures the main topic. ' +
      'Does NOT change the content of entries - only adds/improves the title after the time.',
    readFiles: [PROJECT_FILES.log],
    writeFiles: [PROJECT_FILES.log],
    risk: 'low',
    confirmation: 'preview',
    allowsDelete: false,
    allowsCrossFileMove: false,
    rules: [
      'Only touch entries that lack titles (format: HH:MMam/pm with no " - " title after)',
      'Generate titles that are 1-5 words, descriptive, scannable',
      'Format: HH:MMam/pm - <Short Title>',
      'Titles should capture the main topic or action (e.g., "MCP Server", "Bug Fix", "Planning Session")',
      'Use comma-separated titles to capture multiple ideas (e.g., "11:48am - MCP Server, Diff Modal, Bug Fixes")',
      'Do NOT modify entry content',
      'Do NOT add new entries',
      'Do NOT reorder or restructure the log',
      'If an entry already has a title (has " - " after time), leave it alone',
    ],
  },
}

// ============================================================================
// Hidden Workflows (TODO: Re-enable as they're refined)
// ============================================================================

// const HIDDEN_WORKFLOWS = {
//   /**
//    * SYNTHESIZE: Light polish for clarity and consistency.
//    * Low risk, no confirmation needed.
//    */
//   synthesize: {
//     name: 'synthesize',
//     displayName: 'Synthesize',
//     description: 'Light polish for clarity and consistency',
//     intent:
//       'Improve readability and consistency within files. Fix typos, clarify language, ' +
//       'remove redundancy, ensure consistent formatting. Does NOT add new content or make ' +
//       'structural changes. Does NOT move or delete existing content.',
//     readFiles: [PROJECT_FILES.overview, PROJECT_FILES.roadmap, PROJECT_FILES.tasks, PROJECT_FILES.log, PROJECT_FILES.ideas],
//     writeFiles: [PROJECT_FILES.overview, PROJECT_FILES.roadmap, PROJECT_FILES.tasks, PROJECT_FILES.log, PROJECT_FILES.ideas],
//     risk: 'low',
//     confirmation: 'none',
//     allowsDelete: false,
//     allowsCrossFileMove: false,
//     rules: [
//       'Do NOT add new sections or content',
//       'Do NOT remove any user-written content',
//       'Do NOT move content between files',
//       'Fix only: typos, grammar, formatting inconsistencies, redundant phrasing',
//       'Preserve the author\'s voice and intent',
//       'If uncertain whether a change is polish vs. restructure, skip it',
//     ],
//   },
//
//   /**
//    * HARVEST TASKS: Extract actionable items from Log/Ideas → Tasks.
//    * Low risk, preview mode.
//    */
//   'harvest-tasks': {
//     name: 'harvest-tasks',
//     displayName: 'Harvest Tasks',
//     description: 'Extract actionable items from Log and Ideas into Tasks',
//     intent:
//       'Find actionable items buried in Log.md and Ideas.md, then COPY them into Tasks.md. ' +
//       'Does NOT delete or move the original text - only copies to Tasks.md.',
//     readFiles: [PROJECT_FILES.log, PROJECT_FILES.ideas, PROJECT_FILES.tasks],
//     writeFiles: [PROJECT_FILES.tasks],
//     risk: 'low',
//     confirmation: 'preview',
//     allowsDelete: false,
//     allowsCrossFileMove: false,
//     rules: [
//       'COPY, do not MOVE - leave original text in Log/Ideas',
//       'Add a source reference: (from Log YYYY-MM-DD) or (from Ideas)',
//       'Only harvest items that are clearly actionable',
//       'Do not create tasks from vague musings or questions',
//       'If a task already exists in Tasks.md, do not duplicate it',
//       'Format harvested tasks according to Tasks.md conventions',
//     ],
//   },
//
//   /**
//    * TRIAGE: Organize Tasks.md into executable priority order.
//    * Low risk, preview mode.
//    */
//   triage: {
//     name: 'triage',
//     displayName: 'Triage',
//     description: 'Organize Tasks.md into executable priority order',
//     intent:
//       'Review Tasks.md and organize it for execution. Mark "Next 1-3 Actions", ' +
//       'split oversized tasks, flag unclear tasks, group by theme if helpful. ' +
//       'Does NOT delete tasks or add new content - only reorganizes existing.',
//     readFiles: [PROJECT_FILES.tasks, PROJECT_FILES.roadmap],
//     writeFiles: [PROJECT_FILES.tasks],
//     risk: 'low',
//     confirmation: 'preview',
//     allowsDelete: false,
//     allowsCrossFileMove: false,
//     rules: [
//       'Mark the 1-3 most important tasks as "Next" or similar',
//       'Split any task that would take more than 2-3 hours',
//       'Flag tasks that are unclear or need more definition',
//       'Group related tasks if it improves scannability',
//       'Do NOT delete any tasks - only reorganize',
//       'Do NOT add new tasks - only work with existing',
//       'Consult Roadmap.md to align priorities with milestones',
//     ],
//   },
//
//   /**
//    * ALIGN TEMPLATES: Ensure files match current canonical templates.
//    * High risk, confirm mode.
//    */
//   'align-templates': {
//     name: 'align-templates',
//     displayName: 'Align Templates',
//     description: 'Ensure file structure matches current templates',
//     intent:
//       'Compare project files against canonical templates. Add missing sections, ' +
//       'flag extra sections that may be outdated, suggest content migrations. ' +
//       'This is a structural alignment, not content creation.',
//     readFiles: ALL_CORE_FILES,
//     writeFiles: ALL_CORE_FILES,
//     risk: 'high',
//     confirmation: 'confirm',
//     allowsDelete: false,
//     allowsCrossFileMove: true,
//     rules: [
//       'Add any missing sections from the current templates',
//       'Flag (do not delete) sections that don\'t exist in templates',
//       'Suggest moving misplaced content to the correct file',
//       'Preserve all existing content - do not delete user work',
//       'Update section headings to match template conventions',
//       'If content migration is suggested, get user confirmation first',
//       'Report all changes as a summary at the end',
//     ],
//   },
//
//   /**
//    * ARCHIVE PASS: Move completed or cut work to Archive.
//    * Medium risk, preview mode.
//    */
//   'archive-pass': {
//     name: 'archive-pass',
//     displayName: 'Archive Pass',
//     description: 'Move completed or cut work to Archive',
//     intent:
//       'Find completed tasks, old log entries (30+ days), and cut ideas, then MOVE them to Archive.md. ' +
//       'Preserves full content with dates and source references.',
//     readFiles: [PROJECT_FILES.tasks, PROJECT_FILES.log, PROJECT_FILES.ideas, PROJECT_FILES.archive],
//     writeFiles: [PROJECT_FILES.tasks, PROJECT_FILES.log, PROJECT_FILES.ideas, PROJECT_FILES.archive],
//     risk: 'medium',
//     confirmation: 'preview',
//     allowsDelete: true,
//     allowsCrossFileMove: true,
//     rules: [
//       'Archive completed tasks (marked done, ✓, or similar)',
//       'Archive log entries older than 30 days',
//       'Archive ideas explicitly marked as "cut", "dropped", or "not doing"',
//       'Preserve FULL content when archiving - do not summarize',
//       'Add archive date and source file reference',
//       'Group archived items by source (Tasks, Log, Ideas)',
//       'Get user confirmation before actually removing from source files',
//     ],
//   },
// }

// ============================================================================
// Helpers
// ============================================================================

export function getWorkflowDefinition(name: WorkflowName): WorkflowDefinition {
  return WORKFLOW_DEFINITIONS[name]
}

export function getAllWorkflows(): WorkflowDefinition[] {
  return Object.values(WORKFLOW_DEFINITIONS)
}

/**
 * Get a compact summary of all workflows for the system prompt.
 */
export function getWorkflowSummary(): string {
  const lines: string[] = []
  for (const wf of getAllWorkflows()) {
    lines.push(`• **${wf.displayName}** (${wf.name}): ${wf.description}`)
    lines.push(`  Risk: ${wf.risk} | Confirm: ${wf.confirmation} | Delete: ${wf.allowsDelete ? 'yes' : 'no'}`)
  }
  return lines.join('\n')
}
