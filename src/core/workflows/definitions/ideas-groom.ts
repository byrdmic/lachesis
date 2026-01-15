/**
 * IDEAS GROOM: Extract tasks from Ideas.md.
 * AI-powered with modal confirmation.
 */

import type { WorkflowDefinition } from '../types'
import { PROJECT_FILES } from './constants'

export const ideasGroomWorkflow: WorkflowDefinition = {
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
}
