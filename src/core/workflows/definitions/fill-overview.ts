/**
 * FILL OVERVIEW: AI-guided session to fill in the Overview document.
 * Uses focusedFile mechanism for rich system prompt support.
 */

import type { WorkflowDefinition } from '../types'
import { PROJECT_FILES } from './constants'

export const fillOverviewWorkflow: WorkflowDefinition = {
  name: 'fill-overview',
  displayName: 'Overview: Fill',
  description: 'AI-guided session to fill in the Overview document',
  intent:
    'Guide the user through filling in the Overview.md document section by section. ' +
    'Cover ALL expected sections: Elevator Pitch, Problem Statement, Target Users, ' +
    'Value Proposition, Scope (with In-Scope and Out-of-Scope subsections), Success Criteria, ' +
    'Constraints, and Reference Links. Ask clarifying questions and propose incremental changes.',
  readFiles: [PROJECT_FILES.overview],
  writeFiles: [PROJECT_FILES.overview],
  risk: 'low',
  confirmation: 'preview',
  allowsDelete: false,
  allowsCrossFileMove: false,
  rules: [
    // Initial assessment
    'Start by reading the current Overview.md state',
    'Identify which sections are empty or have only placeholder text',

    // Section order - ALL 10 expected headings must be covered
    'Guide user through ALL sections in this order:',
    '  1. Elevator Pitch (1-2 sentences: what, for whom, why it matters)',
    '  2. Problem Statement (current pain, root cause, consequence if unsolved)',
    '  3. Target Users & Use Context (primary users, context, non-users)',
    '  4. Value Proposition (primary benefit, differentiator)',
    '  5. Scope (brief intro to scope boundaries)',
    '  6. In-Scope (### subsection - bullet list of what IS included)',
    '  7. Out-of-Scope / Anti-Goals (### subsection - what this should NOT become)',
    '  8. Success Criteria (MVP bullets, nice-to-have, hard constraints)',
    '  9. Constraints (time, tech, money, operational - user may skip some)',
    '  10. Reference Links (repo URL, docs, key decisions)',

    // Process rules
    'Ask clarifying questions before proposing changes',
    'Propose small, incremental diffs after each section is discussed',
    'Elevator pitch should be 1-2 sentences capturing the project essence',
    'Keep content concise and focused on user-provided information',

    // Grouping for efficiency
    'Group related sections in conversation when natural:',
    '  - Scope + In-Scope + Out-of-Scope can be discussed together',
    '  - Success Criteria sub-parts can be one conversation',
    '  - Constraints aspects can be one question',

    // Handling skips
    'If user wants to skip a section, acknowledge it and move to the next',
    'For Reference Links, ask if they have a repo URL - can be added later if unknown',

    // Completeness rule
    'IMPORTANT: Do not end the session until all 10 sections have been addressed',
    'Addressed means: filled with content OR explicitly skipped by user',
  ],
  usesAI: true,
}
