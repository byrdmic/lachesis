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
  // ==========================================================================
  // COMBINED WORKFLOWS
  // ==========================================================================

  /**
   * LOG REFINE: Combined workflow for refining log entries.
   * Titles entries, generates potential tasks, then opens groom modal.
   */
  'log-refine': {
    name: 'log-refine',
    displayName: 'Log: Refine',
    description: 'Title entries, generate potential tasks, and review them',
    intent:
      'Combined workflow that processes Log.md in sequence: ' +
      '(1) Add short titles to entries that lack them, ' +
      '(2) Extract potential tasks from entries, ' +
      '(3) Open groom modal to review and move tasks to Tasks.md. ' +
      'This is the recommended way to process log entries.',
    readFiles: [PROJECT_FILES.log, PROJECT_FILES.tasks],
    writeFiles: [PROJECT_FILES.log, PROJECT_FILES.tasks],
    risk: 'low',
    confirmation: 'preview',
    allowsDelete: false,
    allowsCrossFileMove: true,
    rules: [
      // Title rules
      'Only touch entries that lack titles (format: HH:MMam/pm with no " - " title after)',
      'Generate titles that are 1-5 words, descriptive, scannable',
      'Format: HH:MMam/pm - <Short Title>',
      'Use comma-separated titles to capture multiple ideas (e.g., "11:48am - MCP Server, Diff Modal")',

      // Task extraction rules
      'Extract 0-3 clearly actionable tasks from each log entry',
      'If NO clearly actionable tasks exist, do NOT add any tasks section',
      'Tasks must be directly supported by the entry text - do NOT invent tasks',
      'Use Obsidian task checkboxes: - [ ] <task>',
      'Use EXACT format:\n<!-- AI: potential-tasks start -->\n#### Potential tasks (AI-generated)\n- [ ] <task>\n<!-- AI: potential-tasks end -->',

      // Idempotence rules
      'If an entry already has a title, leave it alone',
      'If an entry already has a potential-tasks section, skip task extraction for that entry',

      // Content rules
      'Do NOT modify entry body text (except appending task blocks)',
      'Do NOT add new entries or reorder the log',
    ],
    usesAI: true,
    combinedSteps: ['title-entries', 'generate-tasks', 'groom-tasks'],
  },

  /**
   * TASKS HARVEST: Combined workflow for finding actionable items.
   * Scans all project files including Ideas.md in one pass.
   */
  'tasks-harvest': {
    name: 'tasks-harvest',
    displayName: 'Tasks: Harvest',
    description: 'Find actionable items across all project files',
    intent:
      'Combined harvest workflow that scans ALL project files (Overview, Roadmap, Tasks, Ideas, Log) ' +
      'in a single pass to find actionable items, gaps, and implicit TODOs. ' +
      'Ideas.md sections are processed by heading to preserve context. ' +
      'De-duplicates against existing tasks and presents suggestions in a review modal.',
    readFiles: [
      PROJECT_FILES.overview,
      PROJECT_FILES.roadmap,
      PROJECT_FILES.tasks,
      PROJECT_FILES.ideas,
      PROJECT_FILES.log,
    ],
    writeFiles: [PROJECT_FILES.tasks, PROJECT_FILES.roadmap],
    risk: 'low',
    confirmation: 'preview',
    allowsDelete: false,
    allowsCrossFileMove: false,
    rules: [
      // Analysis rules
      'Read ALL project files for full context before suggesting tasks',
      'Read Roadmap.md to understand available vertical slices for task linking',
      'Extract implicit TODOs from Log.md (keywords: "need to", "should", "TODO", "fix", "add", "refactor")',

      // Ideas.md specific rules
      'Process Ideas.md by ## section headings - each heading represents an idea',
      'Include the ideaHeading field when extracting from Ideas.md for context',
      'Extract actionable ideas, skip vague musings or pure questions',

      // De-duplication rules
      'Check existing Tasks.md for similar tasks before suggesting',
      'If a similar task exists, note it in the existingSimilar field',
      'Skip items that are clearly already in Tasks.md',

      // Output format
      'Output structured JSON, not diff format',
      'Each task must have sourceFile, text, and reasoning fields',
      'For Ideas.md sources, also include ideaHeading field',
      'Suggest appropriate destination: now, next, or later',
      'Suggest slice link if task relates to a Roadmap slice',

      // Content rules
      'Tasks should be concrete and actionable (not vague)',
      'Task descriptions should be concise (1-2 sentences max)',

    ],
    usesAI: true,
    combinedSteps: ['harvest-tasks', 'ideas-groom'],
  },

  /**
   * TASKS MAINTENANCE: Combined workflow for task lifecycle management.
   * Syncs commits (if GitHub configured), archives completed tasks, then promotes next task.
   * Also updates Roadmap.md when promoting tasks to keep Current Focus in sync.
   */
  'tasks-maintenance': {
    name: 'tasks-maintenance',
    displayName: 'Tasks: Maintenance',
    description: 'Sync git commits, archive completed tasks, and promote next task',
    intent:
      'Combined maintenance workflow that handles task lifecycle: ' +
      '(1) If GitHub is configured, sync recent commits to mark tasks complete, ' +
      '(2) Archive all completed tasks to Archive.md organized by vertical slice, ' +
      '(3) If Current section is empty, promote tasks from Later to Current. ' +
      'Skips steps as appropriate (e.g., sync if no GitHub, promote if Current has tasks).',
    readFiles: [PROJECT_FILES.tasks, PROJECT_FILES.archive, PROJECT_FILES.roadmap, PROJECT_FILES.overview],
    writeFiles: [PROJECT_FILES.tasks, PROJECT_FILES.archive, PROJECT_FILES.roadmap],
    risk: 'low',
    confirmation: 'preview',
    allowsDelete: true,
    allowsCrossFileMove: true,
    rules: [
      // Sync commits rules (when GitHub available)
      'Match commits to unchecked tasks (- [ ]) based on semantic similarity',
      'Assign confidence levels: high (direct match), medium (related), low (possible)',
      'Do NOT match commits to already-completed tasks',

      // Archive rules
      'Find all completed tasks (- [x]) in Tasks.md',
      'Group tasks by their vertical slice reference [[Roadmap#VS... — Name]]',
      'Standalone tasks (no slice ref) go under "Completed Tasks" section',
      'Preserve sub-items and acceptance criteria when archiving',

      // Promote rules
      'If Current section is empty after archiving, promote from Later',
      'AI selects best task based on Roadmap alignment and dependencies',

      // Output format for sync
      'For sync: JSON with matches, unmatchedCommits, and summary',
      // Output format for archive
      'For archive: JSON with groups, standaloneTasks, and summary',
      // Output format for promote
      'For promote: JSON with status, selectedTask, reasoning, candidates, and roadmapChanges',
    ],
    usesAI: true,
    combinedSteps: ['sync-commits', 'archive-completed', 'promote-next-task'],
  },

  // ==========================================================================
  // INDIVIDUAL WORKFLOWS (some hidden from UI)
  // ==========================================================================

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
    hidden: true,
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
    hidden: true,
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
      'Move to Current: Remove task from Log.md, add to "Current" section in Tasks.md',
      'Remove empty potential-tasks blocks after processing',
    ],
    usesAI: false,
    hidden: true,
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
      'Cover ALL expected sections: Elevator Pitch, Problem Statement, Target Users, ' +
      'Value Proposition, Scope (with In-Scope and Out-of-Scope subsections), Success Criteria, ' +
      'Constraints, and Reference Links. Ask clarifying questions and propose incremental changes.',
    readFiles: [PROJECT_FILES.overview],
    writeFiles: [PROJECT_FILES.overview],
    risk: 'low',
    confirmation: 'preview',
    allowsDelete: false,
    allowsCrossFileMove: false,
    rules: [
      // Initial assessment
      'Start by reading the current Overview.md state',
      'Identify which sections are empty or have only placeholder text',

      // Section order - ALL 10 expected headings must be covered
      'Guide user through ALL sections in this order:',
      '  1. Elevator Pitch (1-2 sentences: what, for whom, why it matters)',
      '  2. Problem Statement (current pain, root cause, consequence if unsolved)',
      '  3. Target Users & Use Context (primary users, context, non-users)',
      '  4. Value Proposition (primary benefit, differentiator)',
      '  5. Scope (brief intro to scope boundaries)',
      '  6. In-Scope (### subsection - bullet list of what IS included)',
      '  7. Out-of-Scope / Anti-Goals (### subsection - what this should NOT become)',
      '  8. Success Criteria (MVP bullets, nice-to-have, hard constraints)',
      '  9. Constraints (time, tech, money, operational - user may skip some)',
      '  10. Reference Links (repo URL, docs, key decisions)',

      // Process rules
      'Ask clarifying questions before proposing changes',
      'Propose small, incremental diffs after each section is discussed',
      'Elevator pitch should be 1-2 sentences capturing the project essence',
      'Keep content concise and focused on user-provided information',

      // Grouping for efficiency
      'Group related sections in conversation when natural:',
      '  - Scope + In-Scope + Out-of-Scope can be discussed together',
      '  - Success Criteria sub-parts can be one conversation',
      '  - Constraints aspects can be one question',

      // Handling skips
      'If user wants to skip a section, acknowledge it and move to the next',
      'For Reference Links, ask if they have a repo URL - can be added later if unknown',

      // Completeness rule
      'IMPORTANT: Do not end the session until all 10 sections have been addressed',
      'Addressed means: filled with content OR explicitly skipped by user',
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
      'Format slices as headings: ##### VS1 — Slice Name (enables [[Roadmap#VS1 — Slice Name]] links)',
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
    writeFiles: [PROJECT_FILES.tasks, PROJECT_FILES.roadmap],
    risk: 'low',
    confirmation: 'preview',
    allowsDelete: false,
    allowsCrossFileMove: false,
    rules: [
      'Check if Overview.md has an elevator pitch first - redirect if not',
      'Check if Roadmap.md has milestones and slices - redirect to Roadmap: Fill if not',
      'Read Roadmap.md to understand available vertical slices and current focus',
      'Mine Log.md and Ideas.md for actionable items that could become tasks',
      'Create tasks in the Current section, linking to Roadmap slices where applicable',
      'Link tasks to slices using wiki links: [[Roadmap#VS1 — Slice Name]]',
      'Standalone tasks (not linked to any slice) are valid for random ideas/one-offs',
      'Tasks should be small (15-60 minutes), concrete, and have clear acceptance criteria',
      'Ask clarifying questions before proposing any changes',
      'Propose small, incremental diffs - a few tasks at a time',
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
      'for user to review and place in Tasks.md (Current or Later) ' +
      'with optional links to Roadmap slices.',
    readFiles: [
      PROJECT_FILES.overview,
      PROJECT_FILES.roadmap,
      PROJECT_FILES.tasks,
      PROJECT_FILES.ideas,
      PROJECT_FILES.log,
    ],
    writeFiles: [PROJECT_FILES.tasks, PROJECT_FILES.roadmap],
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
      'Suggest appropriate destination: current or later',
      'Suggest slice link if task relates to a Roadmap slice (format: [[Roadmap#VS1 — Slice Name]])',

      // Content rules
      'Tasks should be concrete and actionable (not vague)',
      'Task descriptions should be concise (1-2 sentences max)',
      'Include source context to help user verify',
    ],
    usesAI: true,
    hidden: true,
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
      'for user to review and place in Tasks.md (Current or Later) ' +
      'with optional links to Roadmap slices.',
    readFiles: [
      PROJECT_FILES.ideas,
      PROJECT_FILES.tasks,
      PROJECT_FILES.roadmap,
    ],
    writeFiles: [PROJECT_FILES.tasks, PROJECT_FILES.roadmap],
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
      'Suggest appropriate destination: current or later',
      'Suggest slice link if task relates to a Roadmap slice (format: [[Roadmap#VS1 — Slice Name]])',

      // Content rules
      'Tasks should be concrete and actionable (not vague)',
      'Task descriptions should be concise (1-2 sentences max)',
      'Include the original idea heading as context',
    ],
    usesAI: true,
    hidden: true,
  },

  /**
   * SYNC COMMITS: Match completed git commits to tasks and update their status.
   * AI-powered with modal confirmation.
   */
  'sync-commits': {
    name: 'sync-commits',
    displayName: 'Tasks: Sync Commits',
    description: 'Match completed git commits to tasks and update their status',
    intent:
      'Analyze recent git commits to find which tasks have been completed. ' +
      'Match commit messages to unchecked tasks in Tasks.md based on semantic similarity, ' +
      'keywords, and context. Present matches with confidence levels (high/medium/low) for user review. ' +
      'User can choose to mark tasks as complete only, or mark complete AND archive with commit reference.',
    readFiles: [
      PROJECT_FILES.tasks,
      PROJECT_FILES.archive,
      PROJECT_FILES.overview,
      PROJECT_FILES.roadmap,
    ],
    writeFiles: [PROJECT_FILES.tasks, PROJECT_FILES.archive],
    risk: 'low',
    confirmation: 'preview',
    allowsDelete: false,
    allowsCrossFileMove: true,
    rules: [
      // Analysis rules
      'Analyze recent git commits for task completion signals',
      'Match commits to unchecked tasks (- [ ]) in Tasks.md',
      'Consider commit message title, body, and referenced files',
      'Look for keywords, feature names, and slice references in commits',

      // Confidence levels
      'Assign confidence level to each match:',
      '  - high: Direct match - commit explicitly addresses the task',
      '  - medium: Semantic match - commit is related but not explicit',
      '  - low: Possible match - some overlap but uncertain',

      // Output format
      'Output structured JSON with matches and unmatched commits',
      'Each match must include: commitSha, commitMessage, taskText, taskSection, confidence, reasoning',
      'Include summary with totalCommits, matchedCount, unmatchedCount',

      // What NOT to do
      'Do NOT update Log.md - skip log updates entirely',
      'Do NOT match commits to already-completed tasks (- [x])',
      'Do NOT invent matches - only match if there is clear evidence',
    ],
    usesAI: true,
    hidden: true,
  },

  /**
   * ARCHIVE COMPLETED: Move completed tasks to Archive.md organized by vertical slice.
   * Low risk, preview confirmation, cross-file move.
   */
  'archive-completed': {
    name: 'archive-completed',
    displayName: 'Tasks: Archive Completed',
    description: 'Move completed tasks to Archive.md organized by vertical slice',
    intent:
      'Find completed tasks (- [x]) in Tasks.md and move them to Archive.md. ' +
      'Tasks are grouped by their vertical slice reference ([[Roadmap#VS... — Name]]). ' +
      'Slices with existing headings in Archive.md accumulate new tasks underneath. ' +
      'Standalone tasks (no slice ref) go under a "Completed Tasks" section. ' +
      'Provide summaries and context for each group being archived.',
    readFiles: [PROJECT_FILES.tasks, PROJECT_FILES.archive, PROJECT_FILES.roadmap],
    writeFiles: [PROJECT_FILES.tasks, PROJECT_FILES.archive],
    risk: 'low',
    confirmation: 'preview',
    allowsDelete: true,
    allowsCrossFileMove: true,
    rules: [
      // Finding completed tasks
      'Find all completed tasks (- [x]) in Tasks.md',
      'Include tasks from any section: Current, Later, Done',
      'Preserve any sub-items (indented lines) or acceptance criteria when archiving',

      // Grouping by slice
      'Extract slice reference from each task using [[Roadmap#VS... — Name]] pattern',
      'Group tasks by their slice reference for organized archiving',
      'Tasks without a slice reference are "standalone" tasks',

      // Archive structure
      'For tasks with slice reference: archive under "### VS... — Slice Name" heading',
      'If slice heading already exists in Archive.md under "## Completed Work", append tasks to it',
      'If slice heading does not exist, create it under "## Completed Work"',
      'Standalone tasks go under "### Completed Tasks" heading',

      // Output format
      'Output structured JSON with groups, standaloneTasks, and summary',
      'Each group should include sliceRef, tasks array, and optional summary',
      'Include total counts in summary for UI display',
    ],
    usesAI: true,
    hidden: true,
  },

  /**
   * PROMOTE NEXT TASK: AI-powered selection of the best task to promote from Later to Current.
   * Part of the tasks-maintenance combined workflow.
   */
  'promote-next-task': {
    name: 'promote-next-task',
    displayName: 'Tasks: Promote to Current',
    description: 'AI-powered selection of the best task to promote from Later to Current',
    intent:
      'Analyze project context (Overview, Roadmap, Tasks) to intelligently select ' +
      'the best task to promote from Later section to the Current section. ' +
      'First checks if Current is empty (workflow is optional if Current already has tasks). ' +
      'AI evaluates alignment with current Roadmap focus, dependencies, and strategic value.',
    readFiles: [PROJECT_FILES.overview, PROJECT_FILES.roadmap, PROJECT_FILES.tasks],
    writeFiles: [PROJECT_FILES.tasks],
    risk: 'low',
    confirmation: 'preview',
    allowsDelete: false,
    allowsCrossFileMove: false,
    rules: [
      // Pre-check rules
      'Check if the Current section has tasks (- [ ])',
      'If Current has tasks, workflow can still run to add more from Later',
      'If Current and Later are both empty, respond with status "no_tasks"',

      // Source rules
      'Look for tasks in Later section (## Later)',
      'If Later section is empty (no unchecked tasks), respond with status "no_tasks"',

      // Selection criteria rules
      'Analyze Roadmap.md to understand the current milestone and active slices',
      'Prioritize tasks that align with the active milestone',
      'Prioritize tasks linked to active slices (e.g., [[Roadmap#VS1 — Slice Name]])',
      'Consider task dependencies - if Task B depends on Task A, suggest Task A first',
      'Consider strategic value - small unblocking tasks may have high priority',

      // Output format rules
      'Output structured JSON with status, selectedTask, reasoning, and candidates',
      'For each candidate, include text, score (1-5), and brief note',
      'selectedTask must include: text, sliceLink (if present)',
    ],
    usesAI: true,
    hidden: true,
  },

  /**
   * INIT FROM SUMMARY: Batch-fill Overview, Roadmap, and Tasks from a design summary.
   * Medium risk (multi-file changes), preview confirmation.
   */
  'init-from-summary': {
    name: 'init-from-summary',
    displayName: 'Initialize from Summary',
    description: 'Batch-fill Overview, Roadmap, and Tasks from a design summary',
    intent:
      'Parse a user-provided design summary (from an external AI conversation or planning document) ' +
      'and generate batch updates for Overview.md, Roadmap.md, and Tasks.md in a single response. ' +
      'Only ask clarifying questions when there are genuine gaps, conflicts, or ambiguities that ' +
      'cannot be reasonably inferred from the provided summary.',
    readFiles: [PROJECT_FILES.overview, PROJECT_FILES.roadmap, PROJECT_FILES.tasks],
    writeFiles: [PROJECT_FILES.overview, PROJECT_FILES.roadmap, PROJECT_FILES.tasks],
    risk: 'medium',
    confirmation: 'preview',
    allowsDelete: false,
    allowsCrossFileMove: false,
    rules: [
      // Input handling
      'User will paste a design summary - it may be markdown, prose, or mixed format',
      'Extract: elevator pitch, problem statement, users, scope, constraints, milestones, slices, tasks',

      // Output format
      'Generate unified diffs for ALL THREE files in a single response',
      'Each file gets its own ```diff block with proper --- and +++ headers',
      'Order: Overview.md first, then Roadmap.md, then Tasks.md',
      'Include sufficient context lines in diffs for accurate application',

      // Question policy (CRITICAL)
      'Only ask clarifying questions for GENUINE gaps or conflicts',
      'Genuine gaps: missing elevator pitch, no MVP defined, conflicting scope statements, no target users',
      'Do NOT ask about: formatting preferences, section ordering, obvious inferences, minor details',
      'If summary is complete enough to fill files, generate diffs immediately without questions',
      'When asking questions, be specific about what information is missing',

      // Content mapping - Overview.md
      'Overview.md: elevator pitch (1-3 sentences), problem statement, target users, value proposition, scope (in/out), constraints',
      'Elevator pitch captures: what + who + why in concise form',

      // Content mapping - Roadmap.md
      'Roadmap.md: milestones (M1 = MVP first), with vertical slices nested under each milestone',
      'Milestones must be vertical (demo-able), not horizontal (layers/components)',
      'Each milestone: status, why it matters, outcome, definition of done',
      'Vertical slices: nested under each milestone as #### Slices section, 1-5 days work, demo-able',
      'Each slice needs: **VS# — Name** with Purpose (why it exists), Delivers (what user gets), Solves (what problem it fixes)',
      'Set first milestone Status to active to indicate current work',

      // Content mapping - Tasks.md
      'Tasks.md: extract tasks from slices, link using [[Roadmap#VS1 — Slice Name]]',
      'Tasks should be 15-60 minutes, concrete, with clear acceptance criteria',
      'Standalone tasks (no slice link) are valid for misc/one-off items',
      'Place tasks in Current section',
      'Do NOT invent tasks - only extract from provided summary content',
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
//       'Review Tasks.md and organize it for execution. Mark "Now" (single task), ' +
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
