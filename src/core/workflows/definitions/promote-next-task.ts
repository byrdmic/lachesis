/**
 * PROMOTE NEXT TASK: AI-powered selection of the best task to promote from Later to Current.
 * Part of the tasks-maintenance combined workflow.
 */

import type { WorkflowDefinition } from '../types'
import { PROJECT_FILES } from './constants'

export const promoteNextTaskWorkflow: WorkflowDefinition = {
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
}
