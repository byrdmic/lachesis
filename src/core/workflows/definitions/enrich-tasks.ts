/**
 * ENRICH TASKS: Add rich context to tasks for Claude Code handoff.
 * AI-powered with modal confirmation.
 */

import type { WorkflowDefinition } from '../types'
import { PROJECT_FILES } from './constants'

export const enrichTasksWorkflow: WorkflowDefinition = {
  name: 'enrich-tasks',
  displayName: 'Tasks: Enrich',
  description: 'Add rich context to tasks for Claude Code handoff',
  intent:
    'For each task in Tasks.md (especially in Current section), gather relevant context from ' +
    'Overview constraints, Roadmap slice details, source Log/Ideas entries, and project goals. ' +
    'Output structured JSON with enrichment suggestions including: why the task exists, ' +
    'key considerations, acceptance criteria, and relevant constraints.',
  readFiles: [
    PROJECT_FILES.overview,
    PROJECT_FILES.roadmap,
    PROJECT_FILES.tasks,
    PROJECT_FILES.ideas,
    PROJECT_FILES.log,
    PROJECT_FILES.archive,
  ],
  writeFiles: [PROJECT_FILES.tasks],
  risk: 'low',
  confirmation: 'preview',
  allowsDelete: false,
  allowsCrossFileMove: false,
  rules: [
    // Context gathering rules
    'Read ALL project files to understand full context before enriching',
    'For tasks linked to Roadmap slices ([[Roadmap#VS1 ...]]), pull Purpose/Delivers/Solves from that slice',
    'Check Log.md for source context using HTML comments (<!-- from Log.md ... -->)',
    'Check Ideas.md for related ideas that spawned this task',
    'Extract relevant constraints from Overview.md',

    // Enrichment content rules
    'Each enrichment must include: why (motivation), considerations, acceptance criteria',
    'Keep enrichment concise but complete - aim for 5-15 lines per task',
    'Do NOT duplicate task description - add NEW context only',
    'Prioritize tasks in Current section for enrichment',

    // Output format rules
    'Output structured JSON, not diff format',
    'Each enrichment must include the original task text for matching',
    'Include confidence score for each enrichment (how complete is the context)',
    'Skip tasks that already have enrichment blocks (lines starting with > under the task)',
  ],
  usesAI: true,
  hidden: false,
}
