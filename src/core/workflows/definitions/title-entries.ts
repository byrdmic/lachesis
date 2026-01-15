/**
 * TITLE ENTRIES: Add short titles to log entries that lack them.
 * Low risk, preview confirmation.
 */

import type { WorkflowDefinition } from '../types'
import { PROJECT_FILES } from './constants'

export const titleEntriesWorkflow: WorkflowDefinition = {
  name: 'title-entries',
  displayName: 'Log: Title Entries',
  description: 'Add short titles to log entries that lack them',
  intent:
    'Find log entries that lack titles and add short descriptive titles (1-5 words) after the timestamp. ' +
    'Format: "11:48am - MCP Server" where the title captures the main topic. ' +
    'This workflow ONLY adds titles - it does not modify entry content or extract tasks.',
  readFiles: [PROJECT_FILES.log],
  writeFiles: [PROJECT_FILES.log],
  risk: 'low',
  confirmation: 'preview',
  allowsDelete: false,
  allowsCrossFileMove: false,
  rules: [
    // Which entries to process
    'Only touch entries that lack titles (format: HH:MMam/pm with no " - " title after)',
    'If an entry already has a title (has " - " after time), leave it alone completely',

    // Title format rules
    'Generate titles that are 1-5 words, descriptive, scannable',
    'Format: HH:MMam/pm - <Short Title>',
    'Titles should capture the main topic or action (e.g., "MCP Server", "Bug Fix", "Planning Session")',
    'Use comma-separated titles to capture multiple ideas (e.g., "11:48am - MCP Server, Diff Modal, Bug Fixes")',

    // Content modification rules
    'Do NOT modify entry body text at all',
    'Do NOT add new entries',
    'Do NOT reorder or restructure the log',
    'Do NOT add potential tasks sections - that is a separate workflow',
  ],
  usesAI: true,
  hidden: true,
  autoApplyable: true,
}
