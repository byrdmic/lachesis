/**
 * ROADMAP FILL: AI-guided session to fill in the Roadmap document from scratch.
 * Uses focusedFile mechanism. Requires Overview.md to be filled first.
 */

import type { WorkflowDefinition } from '../types'
import { PROJECT_FILES } from './constants'

export const roadmapFillWorkflow: WorkflowDefinition = {
  name: 'roadmap-fill',
  displayName: 'Roadmap: Fill',
  description: 'AI-guided session to fill in the Roadmap document from scratch',
  intent:
    'Guide the user through filling in Roadmap.md for the first time. ' +
    'Start by understanding project scope from Overview.md, then work through ' +
    'defining milestones and their vertical slices. Vertical slices are demo-able, ' +
    'end-to-end capabilities (typically 1-5 days of work) that break down milestones. ' +
    'Requires Overview.md to have at least an elevator pitch first.',
  readFiles: [PROJECT_FILES.overview, PROJECT_FILES.roadmap],
  writeFiles: [PROJECT_FILES.roadmap],
  risk: 'low',
  confirmation: 'preview',
  allowsDelete: false,
  allowsCrossFileMove: false,
  rules: [
    'Check if Overview.md has an elevator pitch first - redirect if not',
    'Read Overview.md to understand project scope, MVP criteria, and constraints',
    'Start with MVP milestone (M1) - the smallest version that proves this works',
    'Ask clarifying questions before proposing any changes',
    'Milestones must be vertical (demo-able) not horizontal (layers/components)',
    'Each milestone needs: why it matters, outcome, and observable Definition of Done',
    'After defining each milestone, define 2-5 vertical slices for it',
    'Vertical slices are demo-able, end-to-end capabilities (typically 1-5 days of work)',
    'Format slices as headings: ##### VS1 — Slice Name (enables [[Roadmap#VS1 — Slice Name]] links)',
    'Propose small, incremental diffs after each milestone is discussed',
    'Set Current Focus to the active milestone at the end',
    'Work through ONE milestone at a time - do not dump entire roadmap at once',
  ],
  usesAI: true,
}
