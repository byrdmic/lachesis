// Template definitions - thresholds for all core files
// Simplified: no placeholders in templates anymore

import type { ExpectedCoreFile } from '../snapshot'
import type { TemplateDefinition } from './types'
import { OVERVIEW_DEFINITION } from './overview'
import { ROADMAP_DEFINITION } from './roadmap'

// ============================================================================
// Simple Template Definitions
// ============================================================================

const TASKS_DEFINITION: TemplateDefinition = {
  placeholders: [], // No placeholders in simplified templates
  minMeaningful: 50,
  treatEmptyAsTemplate: true,
}

const LOG_DEFINITION: TemplateDefinition = {
  placeholders: [],
  minMeaningful: 20,
  treatEmptyAsTemplate: true,
}

const IDEAS_DEFINITION: TemplateDefinition = {
  placeholders: [],
  minMeaningful: 20,
  treatEmptyAsTemplate: true,
}

const ARCHIVE_DEFINITION: TemplateDefinition = {
  placeholders: [],
  minMeaningful: 50,
  treatEmptyAsTemplate: true,
}

// ============================================================================
// Combined Definitions
// ============================================================================

/**
 * Template definitions for all expected core files.
 */
export const TEMPLATE_DEFINITIONS: Record<ExpectedCoreFile, TemplateDefinition> = {
  'Overview.md': OVERVIEW_DEFINITION,
  'Roadmap.md': ROADMAP_DEFINITION,
  'Tasks.md': TASKS_DEFINITION,
  'Log.md': LOG_DEFINITION,
  'Ideas.md': IDEAS_DEFINITION,
  'Archive.md': ARCHIVE_DEFINITION,
}
