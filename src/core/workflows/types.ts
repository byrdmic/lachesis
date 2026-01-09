/**
 * Named workflows for Lachesis.
 *
 * A workflow is a specific kind of work with explicit limits:
 * - Clear intent (what it is for)
 * - Explicit file read/write boundaries (what it may touch)
 * - Risk level (how invasive it is)
 * - Must not "bundle" other workflows unless explicitly requested
 */

/**
 * The core workflow names used in UI and conversation.
 */
export const WORKFLOW_NAMES = [
  'title-entries',
  'generate-tasks',
  'groom-tasks',
  'fill-overview',
  'roadmap-fill',
  'tasks-fill',
  'harvest-tasks',
  'ideas-groom',
  'sync-commits',
  'archive-completed',
  // TODO: Re-enable as they're refined
  // 'synthesize',
  // 'triage',
  // 'align-templates',
  // 'archive-pass',
] as const

export type WorkflowName = (typeof WORKFLOW_NAMES)[number]

/**
 * Risk level for a workflow.
 * - low: Safe operations, minimal confirmation needed
 * - medium: Some risk, may need preview
 * - high: Significant changes, preview/confirm required
 */
export type WorkflowRisk = 'low' | 'medium' | 'high'

/**
 * Whether confirmation is required before applying changes.
 */
export type ConfirmationMode = 'none' | 'preview' | 'confirm'

/**
 * Definition of a named workflow.
 */
export type WorkflowDefinition = {
  /** Machine-readable name */
  name: WorkflowName
  /** Human-readable display name */
  displayName: string
  /** Short description of the workflow's purpose */
  description: string
  /** Detailed intent - what this workflow is FOR */
  intent: string
  /** Files this workflow may READ */
  readFiles: string[]
  /** Files this workflow may WRITE */
  writeFiles: string[]
  /** Risk level */
  risk: WorkflowRisk
  /** Whether confirmation is required */
  confirmation: ConfirmationMode
  /** Whether this workflow may delete content */
  allowsDelete: boolean
  /** Whether this workflow may move content between files */
  allowsCrossFileMove: boolean
  /** Specific rules for this workflow */
  rules: string[]
  /** Whether this workflow uses AI (false = local-only processing) */
  usesAI: boolean
}

/**
 * Runtime state when a workflow is active.
 */
export type ActiveWorkflow = {
  workflow: WorkflowName
  startedAt: string
  /** Files touched so far */
  touchedFiles: string[]
  /** Whether we're in preview mode */
  previewMode: boolean
}
