/**
 * TASKS HARVEST: Combined workflow for finding actionable items.
 * Scans all project files including Ideas.md in one pass.
 */

import type { WorkflowDefinition } from '../types'
import { PROJECT_FILES } from './constants'

export const tasksHarvestWorkflow: WorkflowDefinition = {
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
}
