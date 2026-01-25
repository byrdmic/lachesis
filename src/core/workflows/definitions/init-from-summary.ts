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
    'Extract: elevator pitch, problem statement, users, scope, constraints, milestones, tasks',

    // Output format
    'Generate unified diffs for ALL THREE files in a single response',
    'Each file gets its own ```diff block with proper --- and +++ headers',
    'Order: Overview.md first, then Roadmap.md, then Tasks.md',
    'Include sufficient context lines in diffs for accurate application',

    // Question policy
    'Only ask clarifying questions for GENUINE gaps or conflicts',
    'If summary is complete enough to fill files, generate diffs immediately',

    // Content mapping - Overview.md (simplified 6 sections)
    'Overview.md: Elevator Pitch, Problem Statement, Target Users, Value Proposition, Scope, Constraints/Principles',

    // Content mapping - Roadmap.md (simplified)
    'Roadmap.md: Just ## Milestones section with ### M1, ### M2, etc.',
    'Milestones must be vertical (demo-able), not horizontal (layers/components)',
    'Each milestone: status, why it matters, outcome, definition of done',
    'Set first milestone Status to active',

    // Content mapping - Tasks.md (simplified)
    'Tasks.md: Just ## Current section with checkbox tasks',
    'Tasks should be 15-60 minutes, concrete',
    'Do NOT invent tasks - only extract from provided summary content',
  ],
  usesAI: true,
}
