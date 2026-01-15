/**
 * TASKS MAINTENANCE: Combined workflow for task lifecycle management.
 * Syncs commits (if GitHub configured), archives completed tasks, then promotes next task.
 * Also updates Roadmap.md when promoting tasks to keep Current Focus in sync.
 */

import type { WorkflowDefinition } from '../types'
import { PROJECT_FILES } from './constants'

export const tasksMaintenanceWorkflow: WorkflowDefinition = {
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
}
