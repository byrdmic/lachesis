/**
 * GENERATE TASKS: Extract potential tasks from log entries.
 * Low risk, preview confirmation.
 */

import type { WorkflowDefinition } from '../types'
import { PROJECT_FILES } from './constants'

export const generateTasksWorkflow: WorkflowDefinition = {
  name: 'generate-tasks',
  displayName: 'Log: Generate Tasks',
  description: 'Extract potential tasks from log entries',
  intent:
    'Scan log entries and extract 0-3 actionable tasks from each entry. ' +
    'Append extracted tasks in a standardized "Potential tasks" section at the bottom of each entry. ' +
    'If no clearly actionable tasks exist in an entry, do NOT add a tasks section. ' +
    'This workflow ONLY extracts tasks - it does not add or modify titles.',
  readFiles: [PROJECT_FILES.log],
  writeFiles: [PROJECT_FILES.log],
  risk: 'low',
  confirmation: 'preview',
  allowsDelete: false,
  allowsCrossFileMove: false,
  rules: [
    // Task extraction rules
    'Extract 0-3 clearly actionable tasks from each log entry',
    'If NO clearly actionable tasks exist in the entry (reflective/vague content), do NOT add any tasks section',
    'Maximum 3 tasks per entry - only include the most concrete, actionable items',
    'Tasks must be directly supported by the entry text - do NOT invent tasks',
    'Tasks should be short, specific, and phrased as actions',

    // Task format (exact format required)
    'Use Obsidian task checkboxes: - [ ] <task>',
    'Append the tasks section at the BOTTOM of the entry (before the next timestamp or date header)',
    'Use this EXACT format:\n<!-- AI: potential-tasks start -->\n#### Potential tasks (AI-generated)\n- [ ] <task 1>\n- [ ] <task 2>\n<!-- AI: potential-tasks end -->',

    // Idempotence rules
    'Before adding a tasks section, check if the entry already contains one',
    'An entry already has a tasks section if it contains "<!-- AI: potential-tasks" OR a heading with "Potential tasks" (case-insensitive)',
    'If a tasks section already exists, do NOT add another one - skip that entry for tasks extraction',
    'NEVER add empty tasks sections or placeholders like "(none)" - simply omit the block entirely if no tasks',

    // Content modification rules
    'Do NOT modify entry titles',
    'Do NOT modify entry body text except to append the AI potential tasks block',
    'Do NOT add new entries',
    'Do NOT reorder or restructure the log',
  ],
  usesAI: true,
  hidden: true,
  autoApplyable: true,
}
