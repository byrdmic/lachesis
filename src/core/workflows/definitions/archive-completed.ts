/**
 * ARCHIVE COMPLETED: Move completed tasks to Archive.md organized by vertical slice.
 * Low risk, preview confirmation, cross-file move.
 */

import type { WorkflowDefinition } from '../types'
import { PROJECT_FILES } from './constants'

export const archiveCompletedWorkflow: WorkflowDefinition = {
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
}
