/**
 * PLAN WORK: Generate and enrich tasks based on user description.
 * AI-powered with modal confirmation.
 *
 * This workflow combines task generation with inline enrichment,
 * creating self-contained work units ready for AI handoff (Claude Code, etc.).
 */

import type { WorkflowDefinition } from '../types'
import { PROJECT_FILES, ALL_CORE_FILES } from './constants'

export const planWorkWorkflow: WorkflowDefinition = {
  name: 'plan-work',
  displayName: 'Plan Work',
  description: 'Generate enriched tasks from a work description',
  intent:
    'Based on a user description of work they want to do, generate tasks with full enrichment ' +
    '(why, considerations, acceptance criteria) inline. Check Roadmap for relevant slices and ' +
    'suggest linking to existing slices or creating new ones. Tasks are ready for immediate ' +
    'AI handoff without needing a separate Enrich Tasks step.',
  readFiles: ALL_CORE_FILES,
  writeFiles: [PROJECT_FILES.tasks, PROJECT_FILES.roadmap],
  risk: 'low',
  confirmation: 'preview',
  allowsDelete: false,
  allowsCrossFileMove: false,
  rules: [
    // Context gathering rules
    'Read ALL project files to understand full context before generating tasks',
    'Check Roadmap.md for existing vertical slices that match the work description',
    'Check Overview.md for constraints that affect how work should be done',
    'Check Tasks.md for existing tasks that may overlap or relate to the new work',
    'Check Archive.md for completed work that provides context',

    // Task generation rules
    'Generate 1-5 tasks based on the work description',
    'Each task should be a single actionable work item (1-5 days of work)',
    'Include full enrichment inline for each task',
    'Tasks must be specific and actionable, not vague goals',

    // Roadmap integration rules
    'Link tasks to existing Roadmap slices when appropriate: [[Roadmap#VS1 — Slice Name]]',
    'If work represents a new feature not in Roadmap, suggest creating a new slice',
    'Include suggested new slices in the output for user review',

    // Enrichment content rules
    'Each task enrichment must include: why (motivation), considerations, acceptance criteria',
    'Keep enrichment concise but complete - aim for 5-15 lines per task',
    'Include relevant constraints from Overview.md in enrichment',

    // Output format rules
    'Output structured JSON, not diff format',
    'Include both tasks and any suggested Roadmap additions in output',
    'Provide a summary of what was generated',
  ],
  usesAI: true,
  hidden: false,
}
