/**
 * HARVEST TASKS: Find actionable items across all project files.
 * AI-powered with modal confirmation.
 */

import type { WorkflowDefinition } from '../types'
import { PROJECT_FILES } from './constants'

export const harvestTasksWorkflow: WorkflowDefinition = {
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
}
