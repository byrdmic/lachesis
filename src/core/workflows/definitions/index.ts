/**
 * Workflow definitions registry.
 *
 * This module aggregates all workflow definitions and provides helpers
 * for accessing them.
 */

import type { WorkflowName, WorkflowDefinition } from '../types'

// Re-export constants
export { PROJECT_FILES, ALL_CORE_FILES } from './constants'

// Import active workflow definitions
import { initFromSummaryWorkflow } from './init-from-summary'
import { enrichTasksWorkflow } from './enrich-tasks'
import { planWorkWorkflow } from './plan-work'

// ============================================================================
// Registry
// ============================================================================

export const WORKFLOW_DEFINITIONS: Record<WorkflowName, WorkflowDefinition> = {
  'enrich-tasks': enrichTasksWorkflow,
  'plan-work': planWorkWorkflow,
  'init-from-summary': initFromSummaryWorkflow,
}

// ============================================================================
// Helpers
// ============================================================================

export function getWorkflowDefinition(name: WorkflowName): WorkflowDefinition {
  return WORKFLOW_DEFINITIONS[name]
}

export function getAllWorkflows(): WorkflowDefinition[] {
  return Object.values(WORKFLOW_DEFINITIONS)
}

/**
 * Get a compact summary of all workflows for the system prompt.
 */
export function getWorkflowSummary(): string {
  const lines: string[] = []
  for (const wf of getAllWorkflows()) {
    lines.push(`• **${wf.displayName}** (${wf.name}): ${wf.description}`)
    lines.push(`  Risk: ${wf.risk} | Confirm: ${wf.confirmation} | Delete: ${wf.allowsDelete ? 'yes' : 'no'}`)
  }
  return lines.join('\n')
}
