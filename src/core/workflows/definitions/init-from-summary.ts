/**
 * INIT FROM SUMMARY: Batch-fill Overview, Roadmap, and Tasks from a design summary.
 * Medium risk (multi-file changes), preview confirmation.
 */

import type { WorkflowDefinition } from '../types'
import { PROJECT_FILES } from './constants'

export const initFromSummaryWorkflow: WorkflowDefinition = {
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
}
