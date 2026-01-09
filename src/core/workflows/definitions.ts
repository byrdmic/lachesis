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
   * TITLE ENTRIES: Add short titles to log entries that lack them.
   * Low risk, preview confirmation.
   */
  'title-entries': {
    name: 'title-entries',
    displayName: 'Log: Title Entries',
    description: 'Add short titles to log entries that lack them',
    intent:
      'Find log entries that lack titles and add short descriptive titles (1-5 words) after the timestamp. ' +
      'Format: "11:48am - MCP Server" where the title captures the main topic. ' +
      'This workflow ONLY adds titles - it does not modify entry content or extract tasks.',
    readFiles: [PROJECT_FILES.log],
    writeFiles: [PROJECT_FILES.log],
    risk: 'low',
    confirmation: 'preview',
    allowsDelete: false,
    allowsCrossFileMove: false,
    rules: [
      // Which entries to process
      'Only touch entries that lack titles (format: HH:MMam/pm with no " - " title after)',
      'If an entry already has a title (has " - " after time), leave it alone completely',

      // Title format rules
      'Generate titles that are 1-5 words, descriptive, scannable',
      'Format: HH:MMam/pm - <Short Title>',
      'Titles should capture the main topic or action (e.g., "MCP Server", "Bug Fix", "Planning Session")',
      'Use comma-separated titles to capture multiple ideas (e.g., "11:48am - MCP Server, Diff Modal, Bug Fixes")',

      // Content modification rules
      'Do NOT modify entry body text at all',
      'Do NOT add new entries',
      'Do NOT reorder or restructure the log',
      'Do NOT add potential tasks sections - that is a separate workflow',
    ],
    usesAI: true,
  },

  /**
   * GENERATE TASKS: Extract potential tasks from log entries.
   * Low risk, preview confirmation.
   */
  'generate-tasks': {
    name: 'generate-tasks',
    displayName: 'Log: Generate Tasks',
    description: 'Extract potential tasks from log entries',
    intent:
      'Scan log entries and extract 0-3 actionable tasks from each entry. ' +
      'Append extracted tasks in a standardized "Potential tasks" section at the bottom of each entry. ' +
      'If no clearly actionable tasks exist in an entry, do NOT add a tasks section. ' +
      'This workflow ONLY extracts tasks - it does not add or modify titles.',
    readFiles: [PROJECT_FILES.log],
    writeFiles: [PROJECT_FILES.log],
    risk: 'low',
    confirmation: 'preview',
    allowsDelete: false,
    allowsCrossFileMove: false,
    rules: [
      // Task extraction rules
      'Extract 0-3 clearly actionable tasks from each log entry',
      'If NO clearly actionable tasks exist in the entry (reflective/vague content), do NOT add any tasks section',
      'Maximum 3 tasks per entry - only include the most concrete, actionable items',
      'Tasks must be directly supported by the entry text - do NOT invent tasks',
      'Tasks should be short, specific, and phrased as actions',

      // Task format (exact format required)
      'Use Obsidian task checkboxes: - [ ] <task>',
      'Append the tasks section at the BOTTOM of the entry (before the next timestamp or date header)',
      'Use this EXACT format:\n<!-- AI: potential-tasks start -->\n#### Potential tasks (AI-generated)\n- [ ] <task 1>\n- [ ] <task 2>\n<!-- AI: potential-tasks end -->',

      // Idempotence rules
      'Before adding a tasks section, check if the entry already contains one',
      'An entry already has a tasks section if it contains "<!-- AI: potential-tasks" OR a heading with "Potential tasks" (case-insensitive)',
      'If a tasks section already exists, do NOT add another one - skip that entry for tasks extraction',
      'NEVER add empty tasks sections or placeholders like "(none)" - simply omit the block entirely if no tasks',

      // Content modification rules
      'Do NOT modify entry titles',
      'Do NOT modify entry body text except to append the AI potential tasks block',
      'Do NOT add new entries',
      'Do NOT reorder or restructure the log',
    ],
    usesAI: true,
  },

  /**
   * GROOM TASKS: Review and process existing potential tasks from log.
   * Non-AI workflow - directly parses Log.md and opens review modal.
   */
  'groom-tasks': {
    name: 'groom-tasks',
    displayName: 'Log: Groom Tasks',
    description: 'Review and process existing potential tasks from log',
    intent:
      'Parse Log.md for existing AI-generated potential tasks blocks and open a review modal ' +
      'to Keep, Reject, or Move tasks to Tasks.md. This workflow does NOT generate new tasks - ' +
      'it only processes tasks that were previously generated by the Generate Tasks workflow.',
    readFiles: [PROJECT_FILES.log, PROJECT_FILES.tasks],
    writeFiles: [PROJECT_FILES.log, PROJECT_FILES.tasks],
    risk: 'low',
    confirmation: 'preview',
    allowsDelete: false,
    allowsCrossFileMove: true,
    rules: [
      'Parse Log.md for <!-- AI: potential-tasks --> blocks',
      'Show all actionable (non-strikethrough, unchecked) tasks in a review modal',
      'Allow user to Keep, Reject, or Move each task',
      'Keep: Leave task in Log.md as-is',
      'Reject: Apply strikethrough to task text in Log.md',
      'Move to Future: Remove task from Log.md, add to "Potential Future Tasks" section in Tasks.md',
      'Remove empty potential-tasks blocks after processing',
    ],
    usesAI: false,
  },

  /**
   * FILL OVERVIEW: AI-guided session to fill in the Overview document.
   * Uses focusedFile mechanism for rich system prompt support.
   */
  'fill-overview': {
    name: 'fill-overview',
    displayName: 'Overview: Fill',
    description: 'AI-guided session to fill in the Overview document',
    intent:
      'Guide the user through filling in the Overview.md document section by section. ' +
      'Start with the elevator pitch, then work through problem statement, target users, ' +
      'value proposition, scope, and other sections. Ask clarifying questions and propose ' +
      'incremental changes as decisions are made.',
    readFiles: [PROJECT_FILES.overview],
    writeFiles: [PROJECT_FILES.overview],
    risk: 'low',
    confirmation: 'preview',
    allowsDelete: false,
    allowsCrossFileMove: false,
    rules: [
      'Start by reading the current Overview.md state',
      'Identify which sections are empty or have only placeholder text',
      'Guide user through sections in order: Elevator Pitch first, then others',
      'Ask clarifying questions before proposing changes',
      'Propose small, incremental diffs after each section is discussed',
      'Elevator pitch should be 1-2 sentences capturing the project essence',
      'Keep content concise and focused on user-provided information',
    ],
    usesAI: true,
  },

  /**
   * ROADMAP FILL: AI-guided session to fill in the Roadmap document from scratch.
   * Uses focusedFile mechanism. Requires Overview.md to be filled first.
   */
  'roadmap-fill': {
    name: 'roadmap-fill',
    displayName: 'Roadmap: Fill',
    description: 'AI-guided session to fill in the Roadmap document from scratch',
    intent:
      'Guide the user through filling in Roadmap.md for the first time. ' +
      'Start by understanding project scope from Overview.md, then work through ' +
      'defining milestones and their vertical slices. Vertical slices are demo-able, ' +
      'end-to-end capabilities (typically 1-5 days of work) that break down milestones. ' +
      'Requires Overview.md to have at least an elevator pitch first.',
    readFiles: [PROJECT_FILES.overview, PROJECT_FILES.roadmap],
    writeFiles: [PROJECT_FILES.roadmap],
    risk: 'low',
    confirmation: 'preview',
    allowsDelete: false,
    allowsCrossFileMove: false,
    rules: [
      'Check if Overview.md has an elevator pitch first - redirect if not',
      'Read Overview.md to understand project scope, MVP criteria, and constraints',
      'Start with MVP milestone (M1) - the smallest version that proves this works',
      'Ask clarifying questions before proposing any changes',
      'Milestones must be vertical (demo-able) not horizontal (layers/components)',
      'Each milestone needs: why it matters, outcome, and observable Definition of Done',
      'After defining each milestone, define 2-5 vertical slices for it',
      'Vertical slices are demo-able, end-to-end capabilities (typically 1-5 days of work)',
      'Format slices as: **VS1 — Slice Name**: 1-2 sentence description',
      'Propose small, incremental diffs after each milestone is discussed',
      'Set Current Focus to the active milestone at the end',
      'Work through ONE milestone at a time - do not dump entire roadmap at once',
    ],
    usesAI: true,
  },

  /**
   * TASKS FILL: AI-guided session to fill in the Tasks document from scratch.
   * Uses focusedFile mechanism. Requires Overview.md and ideally Roadmap.md first.
   */
  'tasks-fill': {
    name: 'tasks-fill',
    displayName: 'Tasks: Fill',
    description: 'AI-guided session to fill in the Tasks document from scratch',
    intent:
      'Guide the user through filling in Tasks.md for the first time. ' +
      'Read Roadmap.md to understand available vertical slices, then extract tasks from ' +
      'those slices. Tasks link to Roadmap slices using wiki links [[Roadmap#VS1 — Slice Name]]. ' +
      'Also supports standalone tasks not linked to any slice. ' +
      'Requires Overview.md to have content; works best when Roadmap.md has milestones and slices defined.',
    readFiles: [PROJECT_FILES.overview, PROJECT_FILES.roadmap, PROJECT_FILES.tasks, PROJECT_FILES.log, PROJECT_FILES.ideas],
    writeFiles: [PROJECT_FILES.tasks],
    risk: 'low',
    confirmation: 'preview',
    allowsDelete: false,
    allowsCrossFileMove: false,
    rules: [
      'Check if Overview.md has an elevator pitch first - redirect if not',
      'Check if Roadmap.md has milestones and slices - redirect to Roadmap: Fill if not',
      'Read Roadmap.md to understand available vertical slices and current focus',
      'Mine Log.md and Ideas.md for actionable items that could become tasks',
      'Create tasks in the Active Tasks section, linking to Roadmap slices where applicable',
      'Link tasks to slices using wiki links: [[Roadmap#VS1 — Slice Name]]',
      'Standalone tasks (not linked to any slice) are valid for random ideas/one-offs',
      'Tasks should be small (15-60 minutes), concrete, and have clear acceptance criteria',
      'Ask clarifying questions before proposing any changes',
      'Propose small, incremental diffs - a few tasks at a time',
      'Set up Next 1-3 Actions for the most important immediate tasks',
      'Never invent tasks - only extract from existing project content',
    ],
    usesAI: true,
  },

  /**
   * HARVEST TASKS: Find actionable items across all project files.
   * AI-powered with modal confirmation.
   */
  'harvest-tasks': {
    name: 'harvest-tasks',
    displayName: 'Tasks: Harvest Tasks',
    description: 'Find actionable items across all project files and add them to Tasks.md',
    intent:
      'Analyze ALL project files (Overview, Roadmap, Tasks, Ideas, Log) for full context. ' +
      'Identify gaps, missing work, implicit TODOs, and ideas that could become tasks. ' +
      'De-duplicate against existing tasks in Tasks.md. Output structured JSON with suggestions ' +
      'for user to review and place in Tasks.md (Next Actions, Active Tasks, or Future Tasks) ' +
      'with optional links to Roadmap slices.',
    readFiles: [
      PROJECT_FILES.overview,
      PROJECT_FILES.roadmap,
      PROJECT_FILES.tasks,
      PROJECT_FILES.ideas,
      PROJECT_FILES.log,
    ],
    writeFiles: [PROJECT_FILES.tasks],
    risk: 'low',
    confirmation: 'preview',
    allowsDelete: false,
    allowsCrossFileMove: false,
    rules: [
      // Analysis rules
      'Read ALL project files for full context before suggesting tasks',
      'Read Roadmap.md to understand available vertical slices for task linking',
      'Extract implicit TODOs from Log.md (keywords: "need to", "should", "TODO", "don\'t forget", "fix", "add", "refactor")',
      'Extract actionable ideas from Ideas.md (not vague musings)',
      'Identify gaps between Roadmap milestones/slices and current Tasks.md',
      'Check Overview.md constraints/scope to ensure suggestions align with project goals',

      // De-duplication rules
      'Check existing Tasks.md for similar tasks before suggesting',
      'If a similar task exists, note it in the existingSimilar field',
      'Skip items that are clearly already in Tasks.md',

      // Output format rules
      'Output structured JSON, not diff format',
      'Each task must have sourceFile, text, and reasoning fields',
      'Suggest appropriate destination: next-actions, active-tasks, or future-tasks',
      'Suggest slice link if task relates to a Roadmap slice (format: [[Roadmap#VS1 — Slice Name]])',

      // Content rules
      'Tasks should be concrete and actionable (not vague)',
      'Task descriptions should be concise (1-2 sentences max)',
      'Include source context to help user verify',
    ],
    usesAI: true,
  },

  /**
   * IDEAS GROOM: Extract tasks from Ideas.md.
   * AI-powered with modal confirmation.
   */
  'ideas-groom': {
    name: 'ideas-groom',
    displayName: 'Ideas: Groom Tasks',
    description: 'Extract actionable tasks from Ideas.md and add them to Tasks.md',
    intent:
      'Analyze Ideas.md to find actionable items that should become tasks. ' +
      'Ideas are typically grouped by ## headings with optional descriptions underneath. ' +
      'De-duplicate against existing tasks in Tasks.md. Output structured JSON with suggestions ' +
      'for user to review and place in Tasks.md (Next Actions, Active Tasks, or Future Tasks) ' +
      'with optional links to Roadmap slices.',
    readFiles: [
      PROJECT_FILES.ideas,
      PROJECT_FILES.tasks,
      PROJECT_FILES.roadmap,
    ],
    writeFiles: [PROJECT_FILES.tasks],
    risk: 'low',
    confirmation: 'preview',
    allowsDelete: false,
    allowsCrossFileMove: false,
    rules: [
      // Analysis rules
      'Read Ideas.md and look for ## section headings that represent ideas',
      'Each ## heading is typically an idea with optional description/notes underneath',
      'Read Roadmap.md to understand available vertical slices for task linking',
      'Read Tasks.md to check for existing similar tasks',

      // What to extract
      'Extract ideas that are concrete and actionable',
      'Ideas with clear action verbs or specific outcomes are good candidates',
      'Skip vague musings, pure questions without clear paths, or brainstorming notes',

      // De-duplication rules
      'Check existing Tasks.md for similar tasks before suggesting',
      'If a similar task exists, note it in the existingSimilar field',
      'Skip items that are clearly already in Tasks.md',

      // Output format rules
      'Output structured JSON, not diff format',
      'Each task must have ideaHeading, text, and reasoning fields',
      'Suggest appropriate destination: next-actions, active-tasks, or future-tasks',
      'Suggest slice link if task relates to a Roadmap slice (format: [[Roadmap#VS1 — Slice Name]])',

      // Content rules
      'Tasks should be concrete and actionable (not vague)',
      'Task descriptions should be concise (1-2 sentences max)',
      'Include the original idea heading as context',
    ],
    usesAI: true,
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
