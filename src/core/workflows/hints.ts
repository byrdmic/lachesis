/**
 * Workflow hints - suggests the next logical workflow after completion.
 */

import type { ProjectSnapshot } from '../project/snapshot'

// ============================================================================
// Types
// ============================================================================

export type WorkflowHint = {
  completedWorkflow: string
  suggestedWorkflow: string | null
  message: string
  actionLabel?: string
  shouldShow: boolean
}

export type HintConditionContext = {
  snapshot: ProjectSnapshot
  affectedCount?: number
}

type HintConfig = {
  nextWorkflow: string | null
  getMessage: (count?: number) => string
  actionLabel: string
  shouldShow: (ctx: HintConditionContext) => boolean
}

// ============================================================================
// Workflow Hints Configuration
// ============================================================================

const WORKFLOW_HINTS: Record<string, HintConfig> = {
  'plan-work': {
    nextWorkflow: 'enrich-tasks',
    getMessage: (count) => `${count} task${count !== 1 ? 's' : ''} added! Enrich them for AI handoff?`,
    actionLabel: 'Enrich Tasks',
    shouldShow: () => true,
  },
  'enrich-tasks': {
    nextWorkflow: null,
    getMessage: () => `Tasks enriched and ready for AI handoff.`,
    actionLabel: '',
    shouldShow: () => false, // No hint - workflow endpoint
  },
  'init-from-summary': {
    nextWorkflow: 'plan-work',
    getMessage: () => `Project initialized! Plan your first tasks?`,
    actionLabel: 'Plan Work',
    shouldShow: () => true,
  },
}

// ============================================================================
// Generator
// ============================================================================

/**
 * Generate a workflow hint based on the completed workflow.
 */
export function generateWorkflowHint(
  completedWorkflow: string,
  context: HintConditionContext,
  affectedCount?: number
): WorkflowHint | null {
  const config = WORKFLOW_HINTS[completedWorkflow]
  if (!config) return null

  return {
    completedWorkflow,
    suggestedWorkflow: config.nextWorkflow,
    message: config.getMessage(affectedCount),
    actionLabel: config.actionLabel || undefined,
    shouldShow: config.shouldShow(context) && config.nextWorkflow !== null,
  }
}
