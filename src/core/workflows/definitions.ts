/**
 * Workflow definitions for Lachesis.
 *
 * This file re-exports from the definitions/ directory for backward compatibility.
 * See definitions/index.ts for the registry and definitions/*.ts for individual workflows.
 */

export {
  PROJECT_FILES,
  ALL_CORE_FILES,
  WORKFLOW_DEFINITIONS,
  getWorkflowDefinition,
  getAllWorkflows,
  getWorkflowSummary,
} from './definitions/index'
