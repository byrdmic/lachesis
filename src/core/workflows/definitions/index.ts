/**
 * Workflow definitions registry.
 *
 * This module aggregates all workflow definitions and provides helpers
 * for accessing them.
 */

import type { WorkflowName, WorkflowDefinition } from '../types'

// Re-export constants
export { PROJECT_FILES, ALL_CORE_FILES } from './constants'

// Import all workflow definitions
import { logRefineWorkflow } from './log-refine'
import { tasksHarvestWorkflow } from './tasks-harvest'
import { tasksMaintenanceWorkflow } from './tasks-maintenance'
import { titleEntriesWorkflow } from './title-entries'
import { generateTasksWorkflow } from './generate-tasks'
import { groomTasksWorkflow } from './groom-tasks'
import { fillOverviewWorkflow } from './fill-overview'
import { roadmapFillWorkflow } from './roadmap-fill'
import { tasksFillWorkflow } from './tasks-fill'
import { harvestTasksWorkflow } from './harvest-tasks'
import { ideasGroomWorkflow } from './ideas-groom'
import { syncCommitsWorkflow } from './sync-commits'
import { archiveCompletedWorkflow } from './archive-completed'
import { promoteNextTaskWorkflow } from './promote-next-task'
import { initFromSummaryWorkflow } from './init-from-summary'

// ============================================================================
// Registry
// ============================================================================

export const WORKFLOW_DEFINITIONS: Record<WorkflowName, WorkflowDefinition> = {
  // Combined workflows
  'log-refine': logRefineWorkflow,
  'tasks-harvest': tasksHarvestWorkflow,
  'tasks-maintenance': tasksMaintenanceWorkflow,

  // Individual workflows
  'title-entries': titleEntriesWorkflow,
  'generate-tasks': generateTasksWorkflow,
  'groom-tasks': groomTasksWorkflow,
  'fill-overview': fillOverviewWorkflow,
  'roadmap-fill': roadmapFillWorkflow,
  'tasks-fill': tasksFillWorkflow,
  'harvest-tasks': harvestTasksWorkflow,
  'ideas-groom': ideasGroomWorkflow,
  'sync-commits': syncCommitsWorkflow,
  'archive-completed': archiveCompletedWorkflow,
  'promote-next-task': promoteNextTaskWorkflow,
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
