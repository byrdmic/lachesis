/**
 * TASKS FILL: AI-guided session to fill in the Tasks document from scratch.
 * Uses focusedFile mechanism. Requires Overview.md and ideally Roadmap.md first.
 */

import type { WorkflowDefinition } from '../types'
import { PROJECT_FILES } from './constants'

export const tasksFillWorkflow: WorkflowDefinition = {
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
}
