/**
 * LOG REFINE: Combined workflow for refining log entries.
 * Titles entries, generates potential tasks, then opens groom modal.
 */

import type { WorkflowDefinition } from '../types'
import { PROJECT_FILES } from './constants'

export const logRefineWorkflow: WorkflowDefinition = {
  name: 'log-refine',
  displayName: 'Log: Refine',
  description: 'Title entries, generate potential tasks, and review them',
  intent:
    'Combined workflow that processes Log.md in sequence: ' +
    '(1) Add short titles to entries that lack them, ' +
    '(2) Extract potential tasks from entries, ' +
    '(3) Open groom modal to review and move tasks to Tasks.md. ' +
    'This is the recommended way to process log entries.',
  readFiles: [PROJECT_FILES.log, PROJECT_FILES.tasks],
  writeFiles: [PROJECT_FILES.log, PROJECT_FILES.tasks],
  risk: 'low',
  confirmation: 'preview',
  allowsDelete: false,
  allowsCrossFileMove: true,
  rules: [
    // Title rules
    'Only touch entries that lack titles (format: HH:MMam/pm with no " - " title after)',
    'Generate titles that are 1-5 words, descriptive, scannable',
    'Format: HH:MMam/pm - <Short Title>',
    'Use comma-separated titles to capture multiple ideas (e.g., "11:48am - MCP Server, Diff Modal")',

    // Task extraction rules
    'Extract 0-3 clearly actionable tasks from each log entry',
    'If NO clearly actionable tasks exist, do NOT add any tasks section',
    'Tasks must be directly supported by the entry text - do NOT invent tasks',
    'Use Obsidian task checkboxes: - [ ] <task>',
    'Use EXACT format:\n<!-- AI: potential-tasks start -->\n#### Potential tasks (AI-generated)\n- [ ] <task>\n<!-- AI: potential-tasks end -->',

    // Idempotence rules
    'If an entry already has a title, leave it alone',
    'If an entry already has a potential-tasks section, skip task extraction for that entry',

    // Content rules
    'Do NOT modify entry body text (except appending task blocks)',
    'Do NOT add new entries or reorder the log',
  ],
  usesAI: true,
  combinedSteps: ['title-entries', 'generate-tasks', 'groom-tasks'],
  autoApplyable: true,
}
